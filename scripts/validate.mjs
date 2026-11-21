#!/usr/bin/env node
// Checks every skill against the Agent Skills specification
// (https://agentskills.io/specification) and this repository's rules, so a
// skill that one harness would refuse never ships. Run: npm run validate

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { parse } from 'yaml';

import { frontmatterBlock, listFiles, loadSkills, readFrontmatter, SKILLS_ROOT } from '../src/skills.mjs';

// Claude.ai refuses an upload with any other top-level key.
const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const MAX_SKILL_LINES = 500;
const TOC_AFTER_LINES = 100;

const problems = [];
const problem = (file, message) => problems.push(`${relative(process.cwd(), file)}: ${message}`);

for (const skill of loadSkills()) {
  const skillFile = join(skill.dir, 'SKILL.md');
  const text = readFileSync(skillFile, 'utf8');
  const block = frontmatterBlock(text);
  let data;
  try {
    data = parse(block);
  } catch (error) {
    problem(skillFile, `frontmatter is not valid YAML: ${error.message}`);
    continue;
  }

  for (const key of Object.keys(data))
    if (!ALLOWED_KEYS.has(key)) problem(skillFile, `frontmatter key "${key}" is not in the specification`);

  const { name, description, compatibility, metadata } = data;
  if (typeof name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64)
    problem(skillFile, 'name must be 1-64 lowercase letters, digits and single hyphens');
  if (name !== basename(skill.dir)) problem(skillFile, `name "${name}" must match its folder "${basename(skill.dir)}"`);
  if (/anthropic|claude/.test(name ?? '')) problem(skillFile, 'name must not contain "anthropic" or "claude"');
  if (!name?.startsWith('agentrail-')) problem(skillFile, 'name must start with "agentrail-" so it never clashes with another vendor\'s skill');
  if (typeof description !== 'string' || description.length === 0 || description.length > 1024)
    problem(skillFile, `description must be 1-1024 characters (it is ${description?.length ?? 0})`);
  if (/<[a-z/]/i.test(description ?? '')) problem(skillFile, 'description must not contain XML tags');
  if (!/\bUse when\b/.test(description ?? '')) problem(skillFile, 'description must say when to use it ("Use when …")');
  if (compatibility !== undefined && (typeof compatibility !== 'string' || compatibility.length > 500))
    problem(skillFile, 'compatibility must be at most 500 characters');
  if (metadata !== undefined) {
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
      problem(skillFile, 'metadata must be a map');
    else
      for (const [key, value] of Object.entries(metadata))
        if (typeof value !== 'string') problem(skillFile, `metadata.${key} must be a quoted string`);
    if (!/^\d+\.\d+\.\d+$/.test(metadata?.version ?? '')) problem(skillFile, 'metadata.version must be a version such as "1.2.0"');
  }

  // The installer reads name, description and metadata without a YAML parser;
  // make sure what it reads is what YAML reads.
  const simple = readFrontmatter(text);
  for (const key of ['name', 'description'])
    if (simple[key] !== data[key]) problem(skillFile, `${key} must be on one line, as "${key}: value", for the installer`);
  for (const [key, value] of Object.entries(metadata ?? {}))
    if (simple.metadata[key] !== value) problem(skillFile, `metadata.${key} must be on one line, for the installer`);

  const lines = text.split('\n').length;
  if (lines > MAX_SKILL_LINES) problem(skillFile, `SKILL.md has ${lines} lines; keep it under ${MAX_SKILL_LINES} and move detail to references/`);

  // Every relative link resolves, and references stay one level deep.
  for (const file of listFiles(skill.dir).filter((path) => path.endsWith('.md'))) {
    const path = join(skill.dir, file);
    const body = readFileSync(path, 'utf8');
    for (const match of body.matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
      const target = match[1];
      if (/^[a-z]+:/i.test(target)) continue;
      const resolved = join(dirname(path), target);
      if (!existsSync(resolved)) problem(path, `link to ${target} does not resolve`);
      if (file !== 'SKILL.md' && relative(skill.dir, resolved).split('/').length > 2)
        problem(path, `link to ${target} goes deeper than one folder from SKILL.md`);
    }
    const bodyLines = body.split('\n').length;
    if (file.startsWith('references/') && bodyLines > TOC_AFTER_LINES && !/^## Contents/m.test(body))
      problem(path, `${bodyLines} lines: add a "## Contents" list near the top`);
  }

  // Every file under references/ and scripts/ is reachable from SKILL.md or a reference.
  const allText = listFiles(skill.dir)
    .filter((path) => path.endsWith('.md'))
    .map((path) => readFileSync(join(skill.dir, path), 'utf8'))
    .join('\n');
  for (const file of listFiles(skill.dir).filter((path) => /^(references|scripts|assets)\//.test(path)))
    if (!allText.includes(basename(file))) problem(join(skill.dir, file), 'nothing links to or names this file');

  for (const file of listFiles(skill.dir))
    if (file.startsWith('.agentrail-skill')) problem(join(skill.dir, file), 'installer marker must not be committed');
}

if (!existsSync(SKILLS_ROOT)) problems.push('skills/ is missing');

if (problems.length > 0) {
  process.stderr.write(`${problems.length} problem(s):\n${problems.map((line) => `  - ${line}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`All ${loadSkills().length} skill(s) are valid.\n`);
