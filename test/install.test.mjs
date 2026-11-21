import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileHashes } from '../src/skills.mjs';
import { ROOT, run, sandbox, SKILL } from './helpers.mjs';

const source = join(ROOT, 'skills', SKILL);

test('installs one checked copy per folder, shared by the harnesses that read it', async () => {
  const box = sandbox();
  const result = await run(box, ['install', '--agent', 'claude-code,codex,cursor,gemini', '--yes']);
  assert.equal(result.code, 0, result.stderr);

  const claude = join(box.home, '.claude', 'skills', SKILL);
  const shared = join(box.home, '.agents', 'skills', SKILL);
  for (const dir of [claude, shared]) {
    const marker = JSON.parse(readFileSync(join(dir, '.agentrail-skill.json'), 'utf8'));
    assert.deepEqual(marker.files, fileHashes(source));
  }
  assert.match(result.stdout, /read by Codex, Cursor, Gemini CLI/);
  assert.match(result.stdout, /Installed\. Every copy was checked\./);
  assert.match(result.stdout, /\$agentrail-getting-started/);
  // Nothing half-made is left beside the skills folders.
  assert.ok(!existsSync(join(box.home, '.agents', `.agentrail-installing-${SKILL}`)));
});

test('installs into the project for --scope project', async () => {
  const box = sandbox();
  const result = await run(box, ['--agent', 'kiro,cline', '--scope', 'project', '--yes']);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(existsSync(join(box.project, '.kiro', 'skills', SKILL, 'SKILL.md')));
  assert.ok(existsSync(join(box.project, '.cline', 'skills', SKILL, 'SKILL.md')));
  assert.ok(!existsSync(join(box.home, '.kiro')));
});

test('installs for the agents found on PATH when none are named', async () => {
  const box = sandbox(['codex']);
  const result = await run(box, ['--yes']);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(existsSync(join(box.home, '.agents', 'skills', SKILL)));
  assert.ok(!existsSync(join(box.home, '.claude', 'skills', SKILL)));
});

test('leaves a folder it did not make alone', async () => {
  const box = sandbox();
  const theirs = join(box.home, '.claude', 'skills', SKILL);
  mkdirSync(theirs, { recursive: true });
  writeFileSync(join(theirs, 'SKILL.md'), 'their own skill');
  const result = await run(box, ['--agent', 'claude-code', '--yes']);
  assert.equal(result.code, 1);
  assert.equal(readFileSync(join(theirs, 'SKILL.md'), 'utf8'), 'their own skill');
  assert.match(result.stdout, /did not make/);
});

test('list finds a changed copy and update restores it', async () => {
  const box = sandbox();
  await run(box, ['--agent', 'claude-code', '--yes']);
  const installed = join(box.home, '.claude', 'skills', SKILL, 'references', 'edge.md');
  writeFileSync(installed, 'edited');

  const listed = await run(box, ['list']);
  assert.equal(listed.code, 1);
  assert.match(listed.stdout, /changed since install: references\/edge\.md/);

  const updated = await run(box, ['update']);
  assert.equal(updated.code, 0, updated.stderr);
  assert.equal(readFileSync(installed, 'utf8'), readFileSync(join(source, 'references', 'edge.md'), 'utf8'));
  assert.equal((await run(box, ['list'])).code, 0);
});

test('uninstall removes only its own copies', async () => {
  const box = sandbox();
  await run(box, ['--agent', 'codex', '--yes']);
  const other = join(box.home, '.agents', 'skills', 'someone-else');
  mkdirSync(other, { recursive: true });
  const result = await run(box, ['uninstall', '--yes']);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(!existsSync(join(box.home, '.agents', 'skills', SKILL)));
  assert.ok(existsSync(other));
});

test('without a terminal it refuses to ask, rather than hang', async () => {
  const box = sandbox();
  const result = await run(box, []);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /--yes/);
  assert.ok(!existsSync(join(box.home, '.claude')));
});

test('asks which scope and agents, shows the plan, and installs on yes', async () => {
  const box = sandbox(['claude']);
  const result = await run(box, [], {
    input: '2\n1,2\ny\n',
    env: { AGENTRAIL_SKILLS_PROMPTS: '1' },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Found on this computer: Claude Code/);
  assert.match(result.stdout, /This will install:/);
  assert.ok(existsSync(join(box.project, '.claude', 'skills', SKILL, 'SKILL.md')));
  assert.ok(existsSync(join(box.project, '.agents', 'skills', SKILL, 'SKILL.md')));
});

test('installs nothing when the answer to "Install now?" is no', async () => {
  const box = sandbox(['claude']);
  const result = await run(box, [], { input: '1\n\nn\n', env: { AGENTRAIL_SKILLS_PROMPTS: '1' } });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Nothing was installed/);
  assert.ok(!existsSync(join(box.home, '.claude', 'skills')));
});

test('--dry-run changes nothing', async () => {
  const box = sandbox();
  const result = await run(box, ['--agent', 'all', '--yes', '--dry-run']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Dry run/);
  assert.ok(!existsSync(join(box.home, '.claude')));
  assert.ok(!existsSync(join(box.home, '.agents')));
});
