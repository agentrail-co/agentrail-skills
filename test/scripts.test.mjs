import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { onPath } from '../src/harnesses.mjs';
import { loadSkills } from '../src/skills.mjs';
import { pack } from '../src/pack.mjs';
import { ROOT, SKILL } from './helpers.mjs';

const scripts = join(ROOT, 'skills', SKILL, 'scripts');

function node(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'agentrail-detect-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

test('detect-project names the edge platform, server SDK and feedback kits', async () => {
  const next = project({
    'package.json': JSON.stringify({ dependencies: { next: '16.1.0', '@modelcontextprotocol/server': '2.3.1' } }),
    'vercel.json': '{}',
    'proxy.ts': '',
  });
  const result = JSON.parse((await node([join(scripts, 'detect-project.mjs'), next])).stdout);
  assert.deepEqual(result.suggest, { edge: 'vercel', serverSdk: ['node'], feedbackKits: ['Website', 'API', 'MCP server'] });
  assert.ok(result.notes.some((note) => note.includes('proxy.ts')));

  const python = project({ 'pyproject.toml': '[project]\ndependencies = ["fastapi>=0.115", "mcp>=1.2"]\n', 'wrangler.toml': '' });
  const py = JSON.parse((await node([join(scripts, 'detect-project.mjs'), python])).stdout);
  assert.deepEqual(py.suggest.serverSdk, ['python']);
  assert.equal(py.suggest.edge, 'cloudflare-workers');
  assert.deepEqual(py.mcpServer, ['python']);
});

/** A stand-in for the feedback service: a project card and a collection endpoint. */
async function feedbackService(card) {
  const received = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (request.method === 'GET' && request.url === '/v1/feedback/acme') {
        response.writeHead(200, { 'content-type': 'application/json' });
        return response.end(JSON.stringify({ slug: 'acme', name: 'Acme', collectionUrl: `${origin}/v1/feedback/acme/reports`, ...card }));
      }
      if (request.method === 'POST' && request.url === '/v1/feedback/acme/reports') {
        received.push({ headers: request.headers, body });
        response.writeHead(201, { 'content-type': 'application/json' });
        return response.end(JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', receivedAt: new Date().toISOString(), repeat: false, message: 'Thanks' }));
      }
      response.writeHead(404).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, received, page: `http://127.0.0.1:${server.address().port}/p/acme` };
}

test('send-test-report sends one report marked as a test', async (t) => {
  const service = await feedbackService({ accepting: true, signedOnly: false });
  t.after(() => service.server.close());
  const result = await node([join(scripts, 'send-test-report.mjs'), service.page], { AGENTRAIL_FEEDBACK_SECRET: '' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(service.received.length, 1);
  assert.equal(JSON.parse(service.received[0].body).test, true);
  assert.equal(service.received[0].headers['feedback-signature'], undefined);
});

test('send-test-report signs for a signed-only project, and refuses without the secret', async (t) => {
  const service = await feedbackService({ accepting: true, signedOnly: true });
  t.after(() => service.server.close());

  const refused = await node([join(scripts, 'send-test-report.mjs'), service.page], { AGENTRAIL_FEEDBACK_SECRET: '' });
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /accepts only signed reports/);
  assert.equal(service.received.length, 0);

  const secret = 'test-signing-secret';
  const signed = await node([join(scripts, 'send-test-report.mjs'), service.page], { AGENTRAIL_FEEDBACK_SECRET: secret });
  assert.equal(signed.code, 0, signed.stderr);
  const [{ headers, body }] = service.received;
  const expected = createHmac('sha256', secret).update(`${headers['feedback-timestamp']}.${body}`).digest('hex');
  assert.equal(headers['feedback-signature'], expected);
  assert.ok(!signed.stdout.includes(secret));
});

test('send-test-report refuses a paused project', async (t) => {
  const service = await feedbackService({ accepting: false, signedOnly: false });
  t.after(() => service.server.close());
  const result = await node([join(scripts, 'send-test-report.mjs'), service.page]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /not accepting/);
  assert.equal(service.received.length, 0);
});

test('pack puts the skill folder at the top of the ZIP, as Claude.ai needs', { skip: !onPath('unzip') && 'unzip is not installed' }, () => {
  const out = mkdtempSync(join(tmpdir(), 'agentrail-pack-'));
  const [skill] = loadSkills().filter((candidate) => candidate.name === SKILL);
  const result = pack(skill, out);
  assert.ok(result.ok, result.problem);
  const listing = spawnSync('unzip', ['-Z1', result.path], { encoding: 'utf8' }).stdout.split('\n');
  assert.ok(listing.includes(`${SKILL}/SKILL.md`));
  assert.ok(listing.every((entry) => entry === '' || entry.startsWith(`${SKILL}/`)));
});

test('a skill made from the template passes validation', () => {
  const copy = mkdtempSync(join(tmpdir(), 'agentrail-new-skill-'));
  for (const part of ['package.json', 'src', 'scripts', 'templates', 'skills'])
    cpSync(join(ROOT, part), join(copy, part), { recursive: true });
  symlinkSync(join(ROOT, 'node_modules'), join(copy, 'node_modules'), 'junction');
  const created = spawnSync(process.execPath, ['scripts/new-skill.mjs', 'agentrail-example-job'], { cwd: copy, encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const validated = spawnSync(process.execPath, ['scripts/validate.mjs'], { cwd: copy, encoding: 'utf8' });
  assert.equal(validated.status, 0, validated.stderr);
});
