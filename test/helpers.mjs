import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BIN = join(ROOT, 'bin', 'agentrail-skills.mjs');
export const SKILL = 'agentrail-getting-started';

/** A fresh home folder, project folder and PATH holding only the given commands. */
export function sandbox(commands = []) {
  const base = mkdtempSync(join(tmpdir(), 'agentrail-skills-'));
  const home = join(base, 'home');
  const project = join(base, 'project');
  const bin = join(base, 'bin');
  for (const dir of [home, project, bin]) mkdirSync(dir, { recursive: true });
  for (const command of commands) {
    const file = join(bin, process.platform === 'win32' ? `${command}.cmd` : command);
    writeFileSync(file, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n');
    chmodSync(file, 0o755);
  }
  return { base, home, project, bin };
}

/** Runs the installer; resolves with its exit code and output. */
export function run(box, args, { input, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: box.project,
      env: {
        HOME: box.home,
        USERPROFILE: box.home,
        PATH: box.bin,
        NO_COLOR: '1',
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}
