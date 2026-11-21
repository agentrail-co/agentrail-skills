// Plans, copies and checks skill installs. A copy is marked with
// MARKER_FILE so update and uninstall touch only folders this installer made;
// a folder of the same name made by anything else is left alone.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { HARNESSES, skillsDir } from './harnesses.mjs';
import { fileHashes, frontmatterBlock, listFiles, readFrontmatter } from './skills.mjs';

export const MARKER_FILE = '.agentrail-skill.json';

/**
 * One copy to make: a skill into one folder, for the harnesses that read it.
 * @typedef {object} Target
 * @property {import('./skills.mjs').Skill} skill
 * @property {string} dir          The skill's folder once installed.
 * @property {string[]} harnesses  Names of the harnesses that read it.
 * @property {'new'|'update'|'foreign'} status
 */

/** Groups the chosen harnesses by folder, so a shared folder gets one copy. */
export function plan({ skills, harnesses, scope, home, project }) {
  /** @type {Map<string, Target>} */
  const targets = new Map();
  for (const skill of skills) {
    for (const harness of harnesses) {
      const dir = join(skillsDir(harness, { scope, home, project }), skill.name);
      const existing = targets.get(dir);
      if (existing) {
        existing.harnesses.push(harness.name);
        continue;
      }
      targets.set(dir, { skill, dir, harnesses: [harness.name], status: statusOf(dir) });
    }
  }
  return [...targets.values()];
}

function statusOf(dir) {
  if (!existsSync(dir)) return 'new';
  return existsSync(join(dir, MARKER_FILE)) ? 'update' : 'foreign';
}

/**
 * Copies one skill into place. The copy is made beside the target and renamed
 * over it, so an interrupted install never leaves half a skill behind.
 */
export function apply(target, { packageVersion, now = new Date() }) {
  if (target.status === 'foreign')
    return { ...target, ok: false, problem: 'a folder with this name exists that this installer did not make; left as it is' };
  // Staged beside the skills folder, not in it, so no harness ever lists a
  // half-made copy, and on the same disk, so the rename cannot fail across disks.
  const staging = join(dirname(dirname(target.dir)), `.agentrail-installing-${target.skill.name}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(dirname(target.dir), { recursive: true });
  cpSync(target.skill.dir, staging, {
    recursive: true,
    filter: (source) => !source.endsWith('.DS_Store'),
  });
  const files = fileHashes(target.skill.dir);
  writeFileSync(
    join(staging, MARKER_FILE),
    `${JSON.stringify(
      {
        skill: target.skill.name,
        version: target.skill.version,
        installedBy: `agentrail-skills ${packageVersion}`,
        installedAt: now.toISOString(),
        files,
      },
      null,
      2,
    )}\n`,
  );
  rmSync(target.dir, { recursive: true, force: true });
  renameSync(staging, target.dir);
  return { ...target, ...check(target.dir, target.skill.name) };
}

/**
 * Whether an installed copy is whole: every file it was installed with is
 * there and unchanged, SKILL.md has frontmatter, and its name matches its folder.
 */
export function check(dir, expectedName) {
  const markerPath = join(dir, MARKER_FILE);
  if (!existsSync(markerPath)) return { ok: false, problem: 'not installed by agentrail-skills' };
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  const skillPath = join(dir, 'SKILL.md');
  if (!existsSync(skillPath)) return { ok: false, problem: 'SKILL.md is missing' };
  const text = readFileSync(skillPath, 'utf8');
  if (frontmatterBlock(text) === null) return { ok: false, problem: 'SKILL.md has no frontmatter' };
  const { name } = readFrontmatter(text);
  if (name !== expectedName) return { ok: false, problem: `SKILL.md is named "${name}", not "${expectedName}"` };
  const present = new Set(listFiles(dir));
  const actual = fileHashes(dir, Object.keys(marker.files).filter((file) => present.has(file)));
  const missing = Object.keys(marker.files).filter((file) => !present.has(file));
  if (missing.length > 0) return { ok: false, problem: `missing ${missing.join(', ')}` };
  const changed = Object.keys(marker.files).filter((file) => actual[file] !== marker.files[file]);
  if (changed.length > 0) return { ok: false, problem: `changed since install: ${changed.join(', ')}` };
  return { ok: true, files: Object.keys(marker.files).length, version: marker.version };
}

/** Every copy this installer made, in every folder any harness reads. */
export function findInstalled({ home, project, skillNames }) {
  const dirs = new Set();
  for (const harness of HARNESSES) {
    dirs.add(skillsDir(harness, { scope: 'user', home, project }));
    if (project) dirs.add(skillsDir(harness, { scope: 'project', home, project }));
  }
  const found = [];
  for (const base of dirs) {
    for (const name of skillNames) {
      const dir = join(base, name);
      if (!existsSync(join(dir, MARKER_FILE))) continue;
      const marker = JSON.parse(readFileSync(join(dir, MARKER_FILE), 'utf8'));
      const readers = HARNESSES.filter(
        (harness) =>
          skillsDir(harness, { scope: 'user', home, project }) === base ||
          (project && skillsDir(harness, { scope: 'project', home, project }) === base),
      ).map((harness) => harness.name);
      found.push({ name, dir, version: marker.version, harnesses: readers, ...check(dir, name) });
    }
  }
  return found;
}

export function remove(dir) {
  if (!existsSync(join(dir, MARKER_FILE))) return { ok: false, problem: 'not installed by agentrail-skills; left as it is' };
  rmSync(dir, { recursive: true, force: true });
  return { ok: true };
}
