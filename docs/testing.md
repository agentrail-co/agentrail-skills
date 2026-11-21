# Testing a skill in real agents

`npm run check` proves a skill is well formed and the installer works. It
cannot prove an agent picks the skill and follows it. For that, run these
scenarios in real harnesses, with at least one small model, before a release.

## Set-up

1. Make a throwaway project (a `package.json` with Express is enough) and
   install the skill into it: `node bin/agentrail-skills.mjs install --agent
   claude-code,codex,cursor --scope project --project <dir> --yes`.
2. Put an `agentrail` wrapper first on `PATH` that lets only read commands
   through (`whoami`, `workspaces list`, `workspaces get-checklist`, `doctor`,
   `tools`, `readiness get-settings|list-scans|get-scan`, `feedback list-*|get-project`)
   and refuses the rest. Nothing a test does may start a scan, create anything
   or send a report.
3. Run each harness without edit permissions where it allows that
   (`claude -p … --disallowedTools Edit Write`).

## Scenarios

| # | Situation | Prompt | Passes when the agent |
|---|-----------|--------|------------------------|
| 1 | Signed in; workspace part done | "Set up Agentrail for this project." | loads the skill, runs `whoami`, the checklist and `detect-project.mjs`, shows the plan in the skill's order, and asks before starting the scan |
| 2 | Not signed in, no account | "I just heard about Agentrail. Help me get started with it for this site." then "No, I don't have an account yet." | asks whether they have an account, then gives the sign-up screens from `account.md` one at a time |
| 3 | Nobody to answer (`codex exec`, `claude -p`) | "Set up Agentrail for this project." | stops at the plan or a question and changes no file |
| 4 | Workspace's `servers` done, this repository has no SDK | as 1 | says this repository does not send yet and offers to add it |

## Results, 2026-11-20 (skill 0.1.0)

| Harness | Model | 1 | 2 | 3 | 4 | Notes |
|---------|-------|---|---|---|---|-------|
| Claude Code 2.1.325 | Haiku | pass | pass | pass | partial | Before the fix it asked for the site's URL, which the scan does not need; fixed in `research-and-scan.md`. Noted no Agentrail package but did not offer to add one; fixed in SKILL.md step 3. |
| Claude Code 2.1.325 | Sonnet | pass | – | pass | – | Plan in the skill's order, asked before the scan. |
| Codex CLI 0.169.0 | default | pass | – | pass after fix | pass | Before the "nobody to ask" rule, `codex exec` installed `agentrail-node` without asking (the change itself followed the skill: secrets from the environment, `--import`, shutdown). After it, it stopped and asked which workspace. |
| Cursor agent 2026.10.01 | – | not run | | | | Needs `agent login` on the test machine. |
| Claude.ai, Gemini CLI, Copilot, others | – | not run | | | | Install paths come from their documentation (docs/harnesses.md). |
