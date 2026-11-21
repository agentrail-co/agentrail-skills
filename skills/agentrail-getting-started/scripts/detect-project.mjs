#!/usr/bin/env node
// Reads a project's manifests and prints, as JSON, what the Agentrail setup
// needs to know: languages, frameworks, hosting, whether it has an MCP server
// or a CLI, and which Agentrail packages it already uses. It only reads files;
// it changes nothing and makes no network call.
//
// Usage: node detect-project.mjs [project directory]

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');

function read(path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return null;
    throw error;
  }
}

function readJson(path) {
  const text = read(path);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { unreadable: path };
  }
}

const has = (path) => existsSync(join(root, path));
const anyOf = (...paths) => paths.filter(has);

const result = {
  root,
  languages: [],
  frameworks: [],
  hosting: [],
  mcpServer: [],
  cli: [],
  agentrail: [],
  envFiles: anyOf('.env', '.env.local', '.env.development', '.dev.vars'),
  notes: [],
};

// Node.js
const pkg = readJson('package.json');
if (pkg && pkg.unreadable) result.notes.push('package.json is not valid JSON');
if (pkg && !pkg.unreadable) {
  result.languages.push('node');
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const dep = (name) => Object.hasOwn(deps, name);
  const frameworks = {
    next: 'nextjs',
    express: 'express',
    fastify: 'fastify',
    hono: 'hono',
    koa: 'koa',
    '@nestjs/core': 'nestjs',
    '@remix-run/node': 'remix',
    '@sveltejs/kit': 'sveltekit',
    astro: 'astro',
    nuxt: 'nuxt',
    vite: 'vite',
    react: 'react',
  };
  for (const [name, label] of Object.entries(frameworks))
    if (dep(name)) result.frameworks.push(label);
  if (dep('@modelcontextprotocol/sdk') || dep('@modelcontextprotocol/server'))
    result.mcpServer.push('node');
  if (pkg.bin) result.cli.push('node');
  for (const name of Object.keys(deps))
    if (/^agentrail-/.test(name)) result.agentrail.push(`${name}@${deps[name]}`);
  if (dep('next')) {
    const nextMajor = Number.parseInt(String(deps.next).replace(/^[^\d]*/, ''), 10);
    if (Number.isFinite(nextMajor)) result.notes.push(`next major version ${nextMajor}`);
  }
  const middleware = anyOf(
    'middleware.ts',
    'middleware.js',
    'src/middleware.ts',
    'src/middleware.js',
    'proxy.ts',
    'proxy.js',
    'src/proxy.ts',
    'src/proxy.js',
  );
  if (middleware.length > 0)
    result.notes.push(`existing middleware or proxy: ${middleware.join(', ')}`);
}

// Go
const goMod = read('go.mod');
if (goMod !== null) {
  result.languages.push('go');
  if (/github\.com\/modelcontextprotocol\/go-sdk|mark3labs\/mcp-go/.test(goMod))
    result.mcpServer.push('go');
  if (/github\.com\/(spf13\/cobra|urfave\/cli)/.test(goMod)) result.cli.push('go');
  for (const [pattern, label] of [
    [/github\.com\/gin-gonic\/gin/, 'gin'],
    [/github\.com\/labstack\/echo/, 'echo'],
    [/github\.com\/go-chi\/chi/, 'chi'],
    [/github\.com\/gofiber\/fiber/, 'fiber'],
  ])
    if (pattern.test(goMod)) result.frameworks.push(label);
  if (/github\.com\/agentrail-co\/agentrail-go/.test(goMod))
    result.agentrail.push('agentrail-go');
}

// Python
const python = ['pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py']
  .map(read)
  .filter((text) => text !== null)
  .join('\n')
  .toLowerCase();
if (python !== '') {
  result.languages.push('python');
  for (const [pattern, label] of [
    [/\bfastapi\b/, 'fastapi'],
    [/\bdjango\b/, 'django'],
    [/\bflask\b/, 'flask'],
    [/\bstarlette\b/, 'starlette'],
    [/\blitestar\b/, 'litestar'],
    [/\bquart\b/, 'quart'],
  ])
    if (pattern.test(python)) result.frameworks.push(label);
  if (/(^|[\s"'[,])(mcp|fastmcp)([\s"'\]=<>~!;,[]|$)/m.test(python))
    result.mcpServer.push('python');
  if (/\b(click|typer)\b|\[project\.scripts\]/.test(python)) result.cli.push('python');
  if (/agentrail-python/.test(python)) result.agentrail.push('agentrail-python');
}

// Hosting
if (anyOf('vercel.json', '.vercel').length > 0) result.hosting.push('vercel');
if (anyOf('wrangler.toml', 'wrangler.json', 'wrangler.jsonc').length > 0)
  result.hosting.push('cloudflare-workers');
if (anyOf('netlify.toml').length > 0) result.hosting.push('netlify');
if (anyOf('fly.toml').length > 0) result.hosting.push('fly');
if (anyOf('render.yaml').length > 0) result.hosting.push('render');
if (anyOf('Dockerfile').length > 0) result.hosting.push('docker');
if (anyOf('app.yaml').length > 0) result.hosting.push('app-engine');

// Web pages and llms.txt, for the browser script and feedback invitations
const llms = anyOf('llms.txt', 'public/llms.txt', 'static/llms.txt');
if (llms.length > 0) result.notes.push(`llms.txt: ${llms.join(', ')}`);

// Monorepos: list workspaces so the agent can look inside them
const workspaceDirs = ['apps', 'packages', 'services']
  .filter(has)
  .flatMap((dir) =>
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${dir}/${entry.name}`),
  );
if (workspaceDirs.length > 0) {
  result.notes.push(
    `monorepo: run this again in each of ${workspaceDirs.slice(0, 20).join(', ')}`,
  );
}

const unique = (list) => [...new Set(list)];
for (const key of ['languages', 'frameworks', 'hosting', 'mcpServer', 'cli', 'agentrail'])
  result[key] = unique(result[key]);

result.suggest = {
  edge: result.hosting.includes('cloudflare-workers')
    ? 'cloudflare-workers'
    : result.hosting.includes('vercel') || result.frameworks.includes('nextjs')
      ? 'vercel'
      : 'ask where the site is hosted',
  serverSdk: result.languages.filter((language) =>
    ['node', 'go', 'python'].includes(language),
  ),
  feedbackKits: unique([
    ...(result.frameworks.some((name) =>
      ['nextjs', 'astro', 'remix', 'sveltekit', 'nuxt', 'vite', 'react', 'django', 'flask'].includes(name),
    )
      ? ['Website']
      : []),
    ...(result.languages.length > 0 ? ['API'] : []),
    ...(result.mcpServer.length > 0 ? ['MCP server'] : []),
    ...(result.cli.length > 0 ? ['CLI'] : []),
  ]),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
