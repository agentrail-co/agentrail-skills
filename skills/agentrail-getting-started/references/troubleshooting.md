# Troubleshooting

## Contents

- Checklist reasons
- Source stays waiting
- The CLI
- The SDKs
- Feedback
- Sign-up and the workspace

## Checklist reasons

| `reason`             | Means                                                         | Do                                                                                                   |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `research_failed`    | The newest research run failed.                                | An Admin opens **Brand Vault**, reads the cause, selects **Research again**.                         |
| `github_paused`      | GitHub paused the connection.                                  | An Admin connects GitHub again from **Integrations**.                                               |
| `browser_only`       | Only the browser script has sent events.                       | Install the edge ([edge.md](edge.md)).                                                               |
| `no_web_surface`     | The Brand Vault lists no website or web app.                   | Skip, or correct the Brand Vault, or install the browser script anyway.                              |
| `no_server_surface`  | It lists no API, web app, sign-up or MCP server.               | Skip, or correct the Brand Vault, or install a server SDK anyway.                                   |
| `no_sign_in_surface` | It lists no sign-up or web app.                                | Skip, or correct the Brand Vault.                                                                    |
| `no_mcp_server`      | It lists no MCP server.                                        | Skip; if the repository has one, correct the Brand Vault or wrap it with the server SDK anyway.      |
| `readiness_off`      | Readiness is off for the workspace.                            | An Admin turns it on in **Agent readiness** › **Settings**.                                         |
| `agent_access_off`   | The organization does not allow agent access.                  | Continue through the web page; see [connect-agent.md](connect-agent.md).                            |

## Source stays waiting

The source exists and nothing has reached it.

1. Is the code running where requests arrive? A change that is only committed,
   or deployed to a preview the requests never hit, sends nothing.
2. Are `AGENTRAIL_SECRET` and `AGENTRAIL_HASH_KEY` set in that environment? A
   server SDK started without them throws, or `init` refuses.
3. Did a request reach it? Send one yourself to a page or endpoint it serves.
4. Is the collector address right? Edge: `/ingest/events`. Servers:
   `/ingest/otlp` (the SDKs add `/v1/traces` themselves). Browser: the tag's
   own `src`, or `/ingest/browser`.
5. Is the secret this source's? A secret from another, or a revoked, source is
   refused. The SDK's `onError` says so; on the edge, `onError` is told within
   25 seconds.
6. Server SDKs: `agentrail.diagnostics()` (Node) shows `exported` and `dropped`.
   `dropped` with errors means the collector refused them.

## The CLI

| Message                                                       | Do                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Node 20… is too old; agentrail-cli needs 22 or later.`       | Upgrade Node, or run it through a Node 22+ version manager.                    |
| `Unknown command "…"`                                         | Run `agentrail tools` for the real names; never guess one.                    |
| Exit code 2, "needs a newer CLI"                              | `npm install -g agentrail-cli@latest`.                                         |
| Not signed in, or the sign-in expired                         | `agentrail login`, the two-step way in [connect-agent.md](connect-agent.md).   |
| The keychain cannot keep the sign-in                          | Ask, then `agentrail login --insecure-storage`.                               |
| A command acts on the wrong workspace                         | `agentrail workspaces list`, then `agentrail link <workspaceId>`.             |
| The checklist answers 404                                     | Setup was never finished in this workspace: [account.md](account.md).         |

`agentrail doctor` checks all of this at once.

## The SDKs

- **`init` refuses: an OpenTelemetry provider already exists.** Use
  `createProcessors` (Node), `NewProcessors` and `Bind` (Go) or
  `create_processors` (Python), as the reference guide describes.
- **Every request recorded twice (Go).** `otelhttp` already wraps the handler;
  replace it for this scope.
- **Browser calls to the API fail with a CORS error after adding the script.**
  The API's origin is in `data-first-party` but `traceparent` is not an allowed
  CORS request header there. Allow it, or remove the origin from the tag.
- **The edge's and the server's steps don't join.** Both need the same
  `AGENTRAIL_HASH_KEY`, clocks within 60 seconds, and any path or query rewrite
  done in `prepareOriginRequest` before signing.
- **The Vercel middleware loops or times out.** `origin` points at an address
  the middleware runs on. It must be one it does not run on.

## Feedback

| Error                         | Means                                                                 | Do                                                                    |
| ----------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `403 FEEDBACK_SIGNATURE_REQUIRED` | The project accepts only signed reports.                          | Sign it: set `AGENTRAIL_FEEDBACK_SECRET` and use a kit or the script. |
| `403 FEEDBACK_SIGNATURE_INVALID`  | The secret matches none of the project's, or the clock is off by more than 5 minutes. | Check the secret and the server's clock. |
| `400` with metadata             | Only signed reports may carry `metadata`.                           | Remove it, or sign the report.                                        |
| The page says paused            | The project is paused.                                              | An Admin selects **Resume project**.                                  |
| "This project reached its report limit" | 600 an hour or 5,000 a day.                                | Wait, or ask Agentrail to raise the limits.                           |

A project marked **Suspended by Agentrail** refuses reports; only Agentrail
support can lift that.

## Sign-up and the workspace

See the table at the end of [account.md](account.md). Agentrail needs a browser
window at least 1024 pixels wide. For anything else, the person contacts
Agentrail support.
