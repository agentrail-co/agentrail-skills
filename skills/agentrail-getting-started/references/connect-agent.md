# Connect their agent to Agentrail

Live guides: <https://www.agentrail.co/docs/cli/introduction.md>,
<https://www.agentrail.co/docs/cli/coding-agents.md>

This gives you a way to read their checklist and check every later step. It
also completes the checklist's `own_agent` step, which counts from the agent's
first call to Agentrail.

Pick one way:

- **The CLI** (recommended when you can run commands): works in any agent with
  a shell, and is what the rest of this skill uses for checks.
- **The MCP server**: when this agent cannot run commands, or the person
  prefers tools. Adding a server usually needs a new agent session.

## The CLI

1. Check Node.js: `node --version` must be 22 or later. If it is older, ask the
   person to upgrade Node (or use a version manager) before going on.
2. Install, with their OK: `npm install -g agentrail-cli@latest`. The package
   is `agentrail-cli`. A package named just `agentrail` is not Agentrail's;
   never install it.
3. Sign in. There is no terminal for the person to type in, so it takes two
   runs:
   1. Run `agentrail login`. It prints JSON with `"status": "pending"`, a
      `verificationUrl` and a `userCode`, then stops.
   2. Give the person the URL and the code. They open the URL, check the page
      shows the same code, and confirm it before `expiresAt`.
   3. When they say it is confirmed, run `agentrail login` again. It prints
      `"status": "signed_in"` with their email.
4. Check: `agentrail whoami` names them and the workspace commands use.
   `agentrail doctor` checks Node, the connection, the sign-in and the tools,
   and says what to fix.
5. More than one workspace? Run `agentrail workspaces list`, ask which one this
   repository is for, then run `agentrail link <workspaceId>` at the
   repository's root. That writes `.agentrail/link.json`; it holds no secret.

If the CLI says the keychain cannot keep the sign-in (some containers), ask
before you run `agentrail login --insecure-storage`, which keeps it in a file
only they can read.

Optional, with their OK: `agentrail agent setup` sets up Claude Code, Codex and
Cursor with Agentrail's everyday skill and its MCP server. Each agent then signs
in on its own the first time it uses Agentrail.

## The MCP server

The server is `https://mcp.agentrail.co/mcp`. A read-only one, which offers only
the tools that read, is `https://mcp.agentrail.co/mcp/readonly`. **Settings ·
Agents** (<https://app.agentrail.co/account/agents>) shows the same commands.

| Agent          | Add it                                                                             | Sign in                                       |
| -------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| Claude Code    | `claude mcp add --transport http agentrail https://mcp.agentrail.co/mcp`           | Run `/mcp`, choose `agentrail`, **Authenticate** |
| Codex          | `codex mcp add agentrail --url https://mcp.agentrail.co/mcp`                       | `codex mcp login agentrail`                   |
| Cursor         | Add `{"mcpServers": {"agentrail": {"url": "https://mcp.agentrail.co/mcp"}}}` to `.cursor/mcp.json` | Cursor asks the first time it is used |
| Any other host | Add a remote (streamable HTTP) MCP server with that URL                            | The host opens Agentrail's sign-in            |

Adding a server usually needs a new session. Tell the person: "Start a new
session and say *continue setting up Agentrail*." When you resume, start again
from step 0 of the skill; the checklist says where they are.

## Check it

Read the checklist (`agentrail workspaces get-checklist`, or the MCP tool
`workspaces_get_checklist`). `own_agent` should be `done`. The connection also
appears in **Settings · Agents** under **Your connections**.

## When agent access is off

If `own_agent` has `applies: no` with reason `agent_access_off`, or sign-in is
refused, the organization's Admin has turned agent access off. Either the Admin
turns it on, or you continue without it: the person opens **Getting started**
in the sidebar of <https://app.agentrail.co> and reads you each step's state
whenever you need to check one.
