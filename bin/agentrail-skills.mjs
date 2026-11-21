#!/usr/bin/env node
// Installs Agentrail's Agent Skills into the skills folders of the AI coding
// agents on this computer: interactive by default, or with flags for scripts
// and agents. Run it with `npx github:agentrail-co/agentrail-skills`.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  detectHarnesses,
  FALLBACK_HARNESSES,
  HARNESSES,
  harnessById,
  skillsDir,
} from '../src/harnesses.mjs';
import { apply, findInstalled, plan, remove } from '../src/install.mjs';
import { pack } from '../src/pack.mjs';
import { loadSkills, PACKAGE_ROOT, summary } from '../src/skills.mjs';
import { createUi } from '../src/ui.mjs';

const REPOSITORY = 'agentrail-co/agentrail-skills';
const RELEASES = `https://github.com/${REPOSITORY}/releases/latest/download`;
const VERSION = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

const HELP = `agentrail-skills ${VERSION}: install Agentrail's Agent Skills for your AI coding agents

Usage
  npx github:${REPOSITORY} [command] [options]

Commands
  install     Install skills (the default). Asks what to install unless --yes.
  list        Show the skills and where they are installed.
  update      Reinstall every installed copy at this version.
  uninstall   Remove copies this installer made.
  pack        Make a ZIP of a skill for Claude.ai or Claude Desktop.

Options
  --skill <names>    Skills, comma-separated, or "all". Default: the recommended ones.
  --agent <ids>      Agents, comma-separated, "detected" or "all". Default: detected.
                     ${HARNESSES.map((harness) => harness.id).join(', ')}
  --scope <scope>    "user" (every project, the default) or "project" (this folder).
  --project <dir>    The project folder for --scope project. Default: this folder.
  --out <dir>        Where pack writes the ZIP. Default: this folder.
  -y, --yes          Do not ask; use the options and defaults.
  --dry-run          Show what would change, and change nothing.
  -h, --help         Show this help.
  -v, --version      Show the version.

Examples
  npx github:${REPOSITORY}
  npx github:${REPOSITORY} install --agent claude-code,codex --scope project --yes
  npx github:${REPOSITORY} pack --skill agentrail-getting-started`;

function usageError(message) {
  process.stderr.write(`${message}\nRun with --help to see the options.\n`);
  process.exit(2);
}

function parse(argv) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        skill: { type: 'string' },
        agent: { type: 'string' },
        scope: { type: 'string' },
        project: { type: 'string' },
        out: { type: 'string' },
        yes: { type: 'boolean', short: 'y' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    usageError(error.message);
  }
}

const list = (value) => (value ?? '').split(',').map((part) => part.trim()).filter(Boolean);
const tilde = (path, home) => (path.startsWith(home) ? `~${path.slice(home.length)}` : path);

function pickSkills(option, skills) {
  if (option === undefined) {
    const recommended = skills.filter((skill) => skill.recommended);
    return recommended.length > 0 ? recommended : skills;
  }
  if (option === 'all') return skills;
  return list(option).map((name) => {
    const skill = skills.find((candidate) => candidate.name === name);
    if (!skill) usageError(`No skill named "${name}". Skills: ${skills.map((s) => s.name).join(', ')}`);
    return skill;
  });
}

function pickHarnesses(option, detected) {
  if (option === undefined || option === 'detected')
    return detected.length > 0 ? detected : FALLBACK_HARNESSES.map(harnessById);
  if (option === 'all') return HARNESSES;
  return list(option).map((id) => harnessById(id) ?? usageError(`No agent named "${id}".`));
}

async function install(args, context) {
  const { ui, home, skills } = context;
  const { say, style } = ui;
  const interactive = !args.yes;
  // Without a terminal, asking would hang an agent or a script that never
  // answers. AGENTRAIL_SKILLS_PROMPTS=1 asks anyway, for answers piped in.
  if (interactive && !process.stdin.isTTY && process.env.AGENTRAIL_SKILLS_PROMPTS !== '1')
    usageError('No terminal to ask questions in. Add --yes to install with the options given, or run it in a terminal.');

  say('');
  say(style.bold(`  Agentrail skills  ${style.dim(`v${VERSION}`)}`));
  say('  Installs Agentrail skills for the AI coding agents on this computer.');
  say(style.dim('  Files are copied into each agent\'s skills folder. Nothing is sent anywhere.'));
  say('');

  // 1. Skills
  let chosenSkills = pickSkills(args.skill, skills);
  if (interactive && args.skill === undefined && skills.length > 1) {
    chosenSkills = await ui.chooseMany(
      'Which skills?',
      skills.map((skill) => ({
        label: `${skill.name}${skill.recommended ? style.green('  start here') : ''}`,
        hint: summary(skill.description),
        value: skill,
      })),
      chosenSkills,
    );
  } else {
    for (const skill of chosenSkills) say(`  Skill: ${style.bold(skill.name)}  ${style.dim(summary(skill.description))}`);
    say('');
  }

  // 2. Scope
  let scope = args.scope ?? 'user';
  if (!['user', 'project'].includes(scope)) usageError('--scope is "user" or "project".');
  const project = resolve(args.project ?? process.cwd());
  if (interactive && args.scope === undefined) {
    scope = await ui.choose('Install for every project, or only this one?', [
      { label: 'Every project', hint: 'your user folder; recommended', value: 'user' },
      { label: 'Only this project', hint: tilde(project, home), value: 'project' },
    ]);
    say('');
  }

  // 3. Agents
  const detected = detectHarnesses({ home });
  let harnesses = pickHarnesses(args.agent, detected);
  if (interactive && args.agent === undefined) {
    say(
      detected.length > 0
        ? `  Found on this computer: ${detected.map((harness) => harness.name).join(', ')}`
        : style.yellow('  No AI coding agents found on this computer. Choose the ones you use.'),
    );
    harnesses = await ui.chooseMany(
      'Which agents should get the skills?',
      HARNESSES.map((harness) => ({
        label: harness.name,
        hint: tilde(skillsDir(harness, { scope, home, project }), home),
        value: harness,
      })),
      harnesses,
    );
    say('');
  }

  // 4. Plan
  const targets = plan({ skills: chosenSkills, harnesses, scope, home, project });
  say(style.bold('  This will install:'));
  for (const target of targets) {
    const note =
      target.status === 'update' ? style.dim(' (replaces the copy installed before)') :
      target.status === 'foreign' ? style.yellow(' (skipped: a folder with this name exists that this installer did not make)') : '';
    say(`    ${target.skill.name} → ${tilde(target.dir, home)}${note}`);
    say(style.dim(`      read by ${target.harnesses.join(', ')}`));
  }
  say('');
  if (args['dry-run']) {
    say(style.dim('  Dry run: nothing was changed.'));
    return 0;
  }
  if (interactive && !(await ui.confirm('Install now?'))) {
    say('  Nothing was installed.');
    return 0;
  }

  // 5. Install and check every copy
  const results = targets.map((target) => apply(target, { packageVersion: VERSION }));
  say('');
  for (const result of results) {
    if (result.ok) say(`  ${style.green('✔')} ${tilde(result.dir, home)}  ${style.dim(`${result.files} files checked`)}`);
    else say(`  ${style.red('✘')} ${tilde(result.dir, home)}  ${result.problem}`);
  }
  const failed = results.filter((result) => !result.ok);
  say('');
  if (failed.length === results.length) {
    say(style.red('  Nothing was installed. See the reasons above.'));
    return 1;
  }

  // 6. What to do next
  const installedFor = new Set(results.filter((result) => result.ok).flatMap((result) => result.harnesses));
  const firstSkill = chosenSkills[0].name;
  say(style.green(style.bold(`  Installed. ${failed.length > 0 ? 'Some copies were skipped; see above.' : 'Every copy was checked.'}`)));
  say('');
  say(style.bold('  Next, in your project:'));
  for (const harness of harnesses.filter((h) => installedFor.has(h.name)))
    say(`    • ${harness.name}: ${harness.start.replaceAll('{skill}', firstSkill)}`);
  say('');
  say(`  Using Claude.ai or Claude Desktop? Download ${style.cyan(`${RELEASES}/${firstSkill}.zip`)}`);
  say('  and upload it under Customize › Skills (code execution must be on).');
  say(style.dim(`  Update later with: npx github:${REPOSITORY} update`));
  say('');
  return failed.length > 0 ? 1 : 0;
}

function showList({ ui, home, skills }, project) {
  const { say, style } = ui;
  say(style.bold('Skills in this package'));
  for (const skill of skills)
    say(`  ${skill.name} ${style.dim(`v${skill.version}`)}${skill.recommended ? style.green('  start here') : ''}\n    ${summary(skill.description, 200)}`);
  say('');
  const installed = findInstalled({ home, project, skillNames: skills.map((skill) => skill.name) });
  if (installed.length === 0) {
    say('Not installed anywhere yet. Run the installer without a command to install.');
    return 0;
  }
  say(style.bold('Installed'));
  for (const copy of installed) {
    const state = copy.ok ? style.green('ok') : style.red(copy.problem);
    say(`  ${copy.name} v${copy.version} → ${tilde(copy.dir, home)}  ${state}`);
    say(style.dim(`    read by ${copy.harnesses.join(', ')}`));
  }
  return installed.every((copy) => copy.ok) ? 0 : 1;
}

function update({ ui, home, skills }, project, dryRun) {
  const { say, style } = ui;
  const installed = findInstalled({ home, project, skillNames: skills.map((skill) => skill.name) });
  if (installed.length === 0) {
    say('Nothing to update: no copies made by this installer were found.');
    return 0;
  }
  let failed = 0;
  for (const copy of installed) {
    const skill = skills.find((candidate) => candidate.name === copy.name);
    if (dryRun) {
      say(`  would update ${tilde(copy.dir, home)} from v${copy.version} to v${skill.version}`);
      continue;
    }
    const result = apply({ skill, dir: copy.dir, harnesses: copy.harnesses, status: 'update' }, { packageVersion: VERSION });
    if (result.ok) say(`  ${style.green('✔')} ${tilde(copy.dir, home)}  v${copy.version} → v${skill.version}`);
    else {
      failed += 1;
      say(`  ${style.red('✘')} ${tilde(copy.dir, home)}  ${result.problem}`);
    }
  }
  return failed > 0 ? 1 : 0;
}

async function uninstall({ ui, home, skills }, project, args) {
  const { say, style } = ui;
  const names = args.skill === undefined || args.skill === 'all' ? skills.map((s) => s.name) : list(args.skill);
  const installed = findInstalled({ home, project, skillNames: names });
  if (installed.length === 0) {
    say('Nothing to remove: no copies made by this installer were found.');
    return 0;
  }
  say(style.bold('This removes:'));
  for (const copy of installed) say(`  ${tilde(copy.dir, home)}`);
  if (args['dry-run']) return 0;
  if (!args.yes) {
    if (!process.stdin.isTTY && process.env.AGENTRAIL_SKILLS_PROMPTS !== '1') usageError('Add --yes to remove without asking.');
    if (!(await ui.confirm('Remove these?', false))) return 0;
  }
  for (const copy of installed) {
    const result = remove(copy.dir);
    say(result.ok ? `  ${style.green('✔')} removed ${tilde(copy.dir, home)}` : `  ${style.red('✘')} ${result.problem}`);
  }
  return 0;
}

function packCommand({ ui, skills }, args) {
  const chosen = pickSkills(args.skill, skills);
  let failed = 0;
  for (const skill of chosen) {
    const result = pack(skill, resolve(args.out ?? process.cwd()));
    if (result.ok) ui.say(`  ${ui.style.green('✔')} ${result.path}\n    Upload it in Claude.ai or Claude Desktop under Customize › Skills.`);
    else {
      failed += 1;
      ui.say(`  ${ui.style.red('✘')} ${skill.name}: ${result.problem}. Download it instead: ${RELEASES}/${skill.name}.zip`);
    }
  }
  return failed > 0 ? 1 : 0;
}

async function main() {
  const { values: args, positionals } = parse(process.argv.slice(2));
  if (args.help) return void process.stdout.write(`${HELP}\n`);
  if (args.version) return void process.stdout.write(`${VERSION}\n`);
  const command = positionals[0] ?? 'install';
  if (positionals.length > 1) usageError(`Unexpected "${positionals.slice(1).join(' ')}".`);

  const ui = createUi();
  const context = { ui, home: homedir(), skills: loadSkills() };
  const project = resolve(args.project ?? process.cwd());
  try {
    switch (command) {
      case 'install':
        return await install(args, context);
      case 'list':
        return showList(context, project);
      case 'update':
        return update(context, project, args['dry-run']);
      case 'uninstall':
        return await uninstall(context, project, args);
      case 'pack':
        return packCommand(context, args);
      default:
        usageError(`No command "${command}".`);
    }
  } finally {
    ui.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code ?? 0;
  },
  (error) => {
    process.stderr.write(`agentrail-skills failed: ${error.message}\n`);
    process.exitCode = 1;
  },
);
