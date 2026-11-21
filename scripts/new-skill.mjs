#!/usr/bin/env node
// Starts a new skill from templates/skill. Run: npm run new-skill -- agentrail-<job>

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../src/skills.mjs';

const name = process.argv[2];
if (!name || !/^agentrail-[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
  process.stderr.write('Usage: npm run new-skill -- agentrail-<job>   (lowercase words joined by hyphens)\n');
  process.exit(2);
}
const dir = join(PACKAGE_ROOT, 'skills', name);
if (existsSync(dir)) {
  process.stderr.write(`skills/${name} already exists.\n`);
  process.exit(1);
}
// The template is not named SKILL.md, so no installer or harness mistakes it
// for a real skill.
cpSync(join(PACKAGE_ROOT, 'templates', 'skill'), dir, { recursive: true });
const template = join(dir, 'SKILL.template.md');
writeFileSync(join(dir, 'SKILL.md'), readFileSync(template, 'utf8').replaceAll('agentrail-skill-name', name));
rmSync(template);
process.stdout.write(
  `Created skills/${name}. Next:\n  1. Write its description and steps (see CONTRIBUTING.md).\n  2. npm run build\n  3. npm run check\n`,
);
