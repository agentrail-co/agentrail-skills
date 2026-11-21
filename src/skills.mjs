// The skills this package ships: every folder under skills/ with a SKILL.md.
// Frontmatter is read for `name`, `description` and `metadata` keys only, which
// scripts/validate.mjs guarantees are single-line `key: value` entries; the
// full YAML is validated there with a real YAML parser, not here.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SKILLS_ROOT = join(PACKAGE_ROOT, 'skills');

/** The `---` block at the top of a SKILL.md, or null. */
export function frontmatterBlock(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? match[1] : null;
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  )
    return trimmed.slice(1, -1);
  return trimmed;
}

/** Top-level single-line keys, and the single-line keys under `metadata:`. */
export function readFrontmatter(text) {
  const block = frontmatterBlock(text);
  if (block === null) return null;
  const top = {};
  const metadata = {};
  let inMetadata = false;
  for (const line of block.split(/\r?\n/)) {
    const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (inMetadata && nested) {
      metadata[nested[1]] = unquote(nested[2]);
      continue;
    }
    const entry = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!entry) continue;
    inMetadata = entry[1] === 'metadata' && entry[2].trim() === '';
    if (!inMetadata) top[entry[1]] = unquote(entry[2]);
  }
  return { ...top, metadata };
}

/** Every file in a folder, as paths relative to it with forward slashes. */
export function listFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return files.sort();
}

export function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** A skill's files and their hashes, for installing and checking a copy. */
export function fileHashes(dir, files = listFiles(dir)) {
  return Object.fromEntries(files.map((file) => [file, hashFile(join(dir, file))]));
}

/**
 * @typedef {object} Skill
 * @property {string} name
 * @property {string} description
 * @property {string} version
 * @property {boolean} recommended
 * @property {string} dir
 */

/** @returns {Skill[]} */
export function loadSkills(root = SKILLS_ROOT) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .filter((dir) => statSync(join(dir, 'SKILL.md'), { throwIfNoEntry: false })?.isFile())
    .map((dir) => {
      const frontmatter = readFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
      if (frontmatter === null) throw new Error(`${dir}/SKILL.md has no frontmatter`);
      return {
        name: frontmatter.name,
        description: frontmatter.description,
        version: frontmatter.metadata.version ?? '0.0.0',
        recommended: frontmatter.metadata.recommended === 'true',
        dir,
      };
    })
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name));
}

/** The first sentence of a description, for short listings. */
export function summary(description, max = 110) {
  const first = description.split(/(?<=\.)\s/)[0];
  return first.length <= max ? first : `${first.slice(0, max - 1)}…`;
}
