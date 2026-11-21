# How agent harnesses find and run skills

The installer's table, [src/harnesses.mjs](../src/harnesses.mjs), comes from
this page. Change both together. Checked on 2026-11-20.

## What every harness shares

- The [Agent Skills specification](https://agentskills.io/specification): a
  folder whose `SKILL.md` starts with YAML frontmatter. `name` is at most 64
  lowercase letters, digits and hyphens and matches the folder; `description`
  is at most 1,024 characters. The only other keys are `license`,
  `compatibility`, `metadata` and `allowed-tools`. Claude.ai refuses an upload
  with any other key, so `scripts/validate.mjs` refuses them too.
- Progressive loading: at start-up a harness reads only each skill's `name` and
  `description`; the body loads when the skill is chosen, and files under
  `references/` and `scripts/` only when the body points to them
  ([agentskills.io](https://agentskills.io/client-implementation/adding-skills-support)).
- No skill can depend on, or reliably call, another. A skill is chosen by the
  model from the installed list, so "use skill X" works only where X is
  installed. That is why each skill here stands alone.
- When many skills are installed, harnesses shorten or drop descriptions to
  fit a budget (Codex: 2% of the context window; Claude Code: 1%). Keep the
  first sentence of each description the one that matters.

## Where each harness looks

| Harness                     | One project                                        | Every project                                               | Invoked by                         | Source |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------- | ------ |
| Claude Code                 | `.claude/skills` (not `.agents/skills`)            | `~/.claude/skills`                                          | the model, or `/name`              | [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) |
| Claude.ai, Claude Desktop   | none                                               | ZIP upload, Customize › Skills; code execution on           | the model                          | [claude.com/docs/skills/how-to](https://claude.com/docs/skills/how-to) |
| Codex                       | `.agents/skills` up to the repository root         | `~/.agents/skills`                                          | the model, `$name`, `/skills`      | [developers.openai.com/codex/skills](https://developers.openai.com/codex/skills) |
| Cursor                      | `.agents/skills`, `.cursor/skills`, `.claude/skills` | `~/.agents/skills`, `~/.cursor/skills`, `~/.claude/skills` | the model, `/name`                 | [cursor.com/docs/context/skills](https://cursor.com/docs/context/skills) |
| GitHub Copilot              | `.github/skills`, `.claude/skills`, `.agents/skills` | `~/.copilot/skills`, `~/.agents/skills`                   | the model, `/name`                 | [docs.github.com](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) |
| Gemini CLI                  | `.gemini/skills` or `.agents/skills`               | `~/.gemini/skills` or `~/.agents/skills`                    | the model, after the person allows it | [geminicli.com/docs/cli/skills](https://geminicli.com/docs/cli/skills/) |
| Windsurf (Devin Desktop)    | `.devin/skills`, `.agents/skills`, `.windsurf/skills` | `~/.config/devin/skills`, `~/.agents/skills`             | the model, `/name`                 | [docs.devin.ai](https://docs.devin.ai/desktop/cascade/skills) |
| OpenCode                    | `.opencode/skills`, `.claude/skills`, `.agents/skills` | `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` | the `skill` tool          | [opencode.ai/docs/skills](https://opencode.ai/docs/skills/) |
| Goose                       | `.agents/skills`                                   | `~/.agents/skills`, `~/.claude/skills`                      | the model, `/skills <name>`        | [goose docs](https://goose-docs.ai/docs/guides/context-engineering/using-skills) |
| Amp                         | `.agents/skills`, `.claude/skills`                 | `~/.agents/skills`, `~/.config/agents/skills`, `~/.claude/skills` | the model                    | [ampcode.com/docs](https://ampcode.com/docs/customize/skills) |
| Cline                       | `.cline/skills`, `.clinerules/skills`, `.claude/skills` | `~/.cline/skills`                                      | the `skills` tool, `/name`         | [docs.cline.bot](https://docs.cline.bot/features/skills) |
| Kiro                        | `.kiro/skills` only                                | `~/.kiro/skills`                                            | the model, `/name`                 | [kiro.dev/docs/skills](https://kiro.dev/docs/skills/) |

So the installer writes at most four folders per scope: `.claude/skills`,
`.agents/skills`, `.cline/skills` and `.kiro/skills`.

## Choices the installer makes

- **Copies, not symlinks.** Only Claude Code and Codex document following
  symlinks, and Windows makes symlinks hard. Each copy carries
  `.agentrail-skill.json` with its files' hashes, so `list` can tell an intact
  copy from a changed one, and `update` and `uninstall` touch only its own.
- **A copy is staged, then renamed into place**, beside the skills folder, so a
  harness never lists half a skill.
- **No questions without a terminal** unless `--yes` (or
  `AGENTRAIL_SKILLS_PROMPTS=1` for piped answers), so an agent running the
  installer never hangs on a prompt.
- **No dependencies at run time**, so `npx github:…` starts fast and installs
  nothing but this package. `yaml` is used only by `scripts/validate.mjs`.

## After installing

- Claude Code picks up new skills in a running session; plugins need
  `/reload-plugins` or a new session.
- Codex, Amp and Goose need a new session or thread.
- Gemini CLI asks the person to allow a skill each time one starts.
- Claude.ai needs the uploaded skill switched on, and code execution on.
