// Packs a skill as a ZIP for Claude.ai and Claude Desktop, which take skills as
// uploads with the skill's folder at the top of the ZIP. Uses the system's
// `zip`, or `tar -a` (bsdtar, on macOS and Windows 10 and later).

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { onPath } from './harnesses.mjs';

export function pack(skill, outDir) {
  const out = resolve(outDir, `${skill.name}.zip`);
  rmSync(out, { force: true });
  const cwd = dirname(skill.dir);
  const folder = basename(skill.dir);
  let result;
  if (onPath('zip')) {
    result = spawnSync('zip', ['-r', '-X', '-q', out, folder, '-x', '*.DS_Store'], { cwd, encoding: 'utf8' });
  } else if (onPath('tar')) {
    result = spawnSync('tar', ['-a', '-c', '-f', out, '--exclude', '.DS_Store', folder], { cwd, encoding: 'utf8' });
  } else {
    return { ok: false, problem: 'neither zip nor tar is installed' };
  }
  if (result.error) return { ok: false, problem: result.error.message };
  if (result.status !== 0 || !existsSync(out))
    return { ok: false, problem: (result.stderr || `exited with ${result.status}`).trim() };
  return { ok: true, path: out };
}
