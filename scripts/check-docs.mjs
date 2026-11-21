#!/usr/bin/env node
// Checks the live Agentrail docs still say what the skills rely on: each skill
// file names its live guide, and docs-anchors.json lists the words and code
// those guides must still contain. A miss means a skill may be out of date.
// It also lists the newest SDK versions, to compare with what the skills
// were last checked against. Needs the network. Run: npm run check:docs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../src/skills.mjs';

const anchors = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'scripts', 'docs-anchors.json'), 'utf8'));
const TIMEOUT_MS = 20_000;

async function text(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

let misses = 0;
for (const [url, needles] of Object.entries(anchors.pages)) {
  let body;
  try {
    body = await text(url);
  } catch (error) {
    misses += 1;
    process.stderr.write(`✘ ${url}: ${error.message}\n`);
    continue;
  }
  const missing = needles.filter((needle) => !body.includes(needle));
  if (missing.length === 0) process.stdout.write(`✔ ${url}\n`);
  else {
    misses += missing.length;
    process.stderr.write(`✘ ${url} no longer contains: ${missing.map((m) => JSON.stringify(m)).join(', ')}\n`);
  }
}

for (const [name, checked] of Object.entries(anchors.npm)) {
  try {
    const latest = JSON.parse(await text(`https://registry.npmjs.org/${name}/latest`)).version;
    const note = latest === checked ? '' : `  (skills last checked against ${checked})`;
    process.stdout.write(`${latest === checked ? '✔' : '•'} npm ${name} latest ${latest}${note}\n`);
  } catch (error) {
    process.stderr.write(`✘ npm ${name}: ${error.message}\n`);
  }
}

if (misses > 0) {
  process.stderr.write(`\n${misses} miss(es). Read the guide, update the skill's reference, then update docs-anchors.json.\n`);
  process.exit(1);
}
