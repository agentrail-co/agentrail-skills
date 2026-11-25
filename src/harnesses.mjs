// Where each agent harness looks for Agent Skills, and how it is found on this
// computer. Several harnesses read the shared `.agents/skills` folder, so one
// copy there serves all of them. Sources for each path are in docs/harnesses.md;
// change this table and that document together.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * @typedef {object} Harness
 * @property {string} id         Used with --agent.
 * @property {string} name       Shown to people.
 * @property {string[]} commands Commands that show it is installed.
 * @property {string[]} configDirs Folders under the home folder that show it is installed.
 * @property {string} userDir    Skills folder, relative to the home folder.
 * @property {string} projectDir Skills folder, relative to the project.
 * @property {string} start      How to start the skill after installing, `{skill}` filled in.
 */

/** @type {Harness[]} */
export const HARNESSES = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    commands: ['claude'],
    configDirs: ['.claude'],
    userDir: '.claude/skills',
    projectDir: '.claude/skills',
    start: 'open Claude Code in your project and say "{prompt}" (or type /{skill})',
  },
  {
    id: 'codex',
    name: 'Codex',
    commands: ['codex'],
    configDirs: ['.codex'],
    userDir: '.agents/skills',
    projectDir: '.agents/skills',
    start: 'start a new Codex session and say "{prompt}" (or type ${skill})',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    commands: ['cursor', 'cursor-agent'],
    configDirs: ['.cursor'],
    userDir: '.agents/skills',
    projectDir: '.agents/skills',
    start: 'open a new Agent chat and say "{prompt}" (or type /{skill})',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    commands: ['copilot'],
    configDirs: ['.copilot'],
    userDir: '.agents/skills',
    projectDir: '.agents/skills',
    start: 'in agent mode, say "{prompt}" (or type /{skill})',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    commands: ['gemini'],
    configDirs: ['.gemini'],
    userDir: '.agents/skills',
    projectDir: '.agents/skills',
    start: 'start Gemini CLI, say "{prompt}" and allow the skill when it asks',
  },
  {
    id: 'windsurf',
    name: 'Windsurf (Devin Desktop)',
    commands: ['windsurf', 'devin'],
    configDirs: ['.codeium/windsurf', '.config/devin'],
    userDir: '.agents/skills',
    projectDir: '.agents/skills',
    start: 'in Cascade, say "{prompt}" (or type /{skill})',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    commands: ['opencode'],
    configDirs: ['.config/opencode'],
    userDir: '.agents/skills',
    projectDir: '.agents/skills',
    start: 'start OpenCode and say "{prompt}"',
  },
  {
    id: 'goose',
    name: 'Goose',
    commands: ['goose'],
    configDirs: ['.config/goose'],
    userDir: '.agents/skills',
    projectDir: '.agents/skills',
    start: 'start a new Goose session and say "{prompt}"',
  },
  {
    id: 'amp',
    name: 'Amp',
    commands: ['amp'],
    configDirs: ['.config/amp'],
    userDir: '.agents/skills',
    projectDir: '.agents/skills',
    start: 'start a new Amp thread and say "{prompt}"',
  },
  {
    id: 'cline',
    name: 'Cline',
    commands: ['cline'],
    configDirs: ['.cline'],
    userDir: '.cline/skills',
    projectDir: '.cline/skills',
    start: 'start a new Cline task and say "{prompt}" (or type /{skill})',
  },
  {
    id: 'kiro',
    name: 'Kiro',
    commands: ['kiro', 'kiro-cli'],
    configDirs: ['.kiro'],
    userDir: '.kiro/skills',
    projectDir: '.kiro/skills',
    start: 'open Kiro chat and say "{prompt}" (or type /{skill})',
  },
];

/** When nothing is found, these two folders reach the most harnesses. */
export const FALLBACK_HARNESSES = ['claude-code', 'codex'];

export function harnessById(id) {
  return HARNESSES.find((harness) => harness.id === id);
}

/** Whether a command is on PATH, without running it. */
export function onPath(command, env = process.env) {
  const extensions =
    process.platform === 'win32'
      ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').concat([''])
      : [''];
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const extension of extensions)
      if (existsSync(join(dir, command + extension))) return true;
  }
  return false;
}

/** The harnesses that look installed for this home folder and PATH. */
export function detectHarnesses({ home = homedir(), env = process.env } = {}) {
  return HARNESSES.filter(
    (harness) =>
      harness.commands.some((command) => onPath(command, env)) ||
      harness.configDirs.some((dir) => existsSync(join(home, dir))),
  );
}

/** The skills folder a harness reads, for a scope. */
export function skillsDir(harness, { scope, home, project }) {
  return scope === 'project'
    ? join(project, harness.projectDir)
    : join(home, harness.userDir);
}
