# Journey sources: create one, keep its secrets, check it

Live guide: <https://www.agentrail.co/docs/guides/journeys.md>

The edge, the browser script and the server SDKs each send events to Agentrail
as a **source**. Agents and tools cannot create a source: an Admin does it in
the web app, and its secrets are shown once. Read this once before the edge,
browser script or server step.

## Which source

| Source           | Records                                                              | Checklist step                     |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------- |
| **Edge**         | Every request to the site, including agents that never run JavaScript | `every_request`                    |
| **Browser script** | Page views, the pages' calls to their own services, WebMCP tool calls | `browser_script`                   |
| **Your servers** | Requests the servers answer, verified identity, milestones, logs, MCP calls | `servers`, `sign_in`, `mcp_calls`  |

Start with the edge. The browser script on its own misses agents that never
run JavaScript, and the checklist flags that (`browser_only`).

## Create the source (the Admin, in the browser)

1. In <https://app.agentrail.co>, open **Journeys** and select **Set up**, then
   choose **Edge**, **Browser script** or **Your servers**. (Or, in **Settings ·
   Journeys**, select **Add source**.)
2. Enter a **Name**, such as "Docs edge" or "API servers", and select **Create
   source**.
3. What it shows next:
   - **Edge** and **Your servers**: a **Secret** and a **Hash key**, shown once,
     with the collector endpoint and install examples. Go to "Keep the secrets".
   - **Browser script**: the **Browser script tag**, with a public key that
     starts `ajp_`. It is public because it sits in the page, so the person may
     paste the tag into the chat.

## Keep the secrets (never through the chat)

Tell the person, before they select **I have saved them**:

- Put the **Secret** in the variable `AGENTRAIL_SECRET` and the **Hash key** in
  `AGENTRAIL_HASH_KEY`.
- Where: the platform's secret store for deployed code (Vercel project
  environment variables, `npx wrangler secret put` for Cloudflare, their
  cloud's secret manager), and for local runs an env file that git ignores.
  Check with `git check-ignore -v .env.local` (or their env file) before they
  write to it; if it is not ignored, add it to `.gitignore` first.
- The hash key is the workspace's. The edge and every server must use the same
  one. If a hash key is already set from an earlier source, it is the same
  value; keep it.
- Each source has its own secret. If a secret is lost, the Admin revokes the
  source (**Manage**, then revoke) and creates another.

Then ask them to confirm the variables are set. Never ask for the values.

## The collector

Every example has a collector address. In production it is
`https://api.agentrail.co`, with a path per source:

| Source         | Collector                                  |
| -------------- | ------------------------------------------ |
| Edge           | `https://api.agentrail.co/ingest/events`   |
| Browser script | `https://api.agentrail.co/agentrail.js` (the tag) or `/ingest/browser` (bundled) |
| Your servers   | `https://api.agentrail.co/ingest/otlp`     |

The web app's examples show the exact address for their workspace. If it
differs from this table, use the web app's.

## Check a source

1. Make the code run and send it one request: deploy it, or run it locally and
   request a page or an endpoint it serves. A local run sends events too.
2. Read the checklist. The step moves from `waiting` to `done` once the first
   event arrives, usually within a minute.
3. Or, in the web app: **Settings · Journeys**, **Refresh sources**. The source
   shows **Events received** and a **Last event** time.

Still `waiting` after a request? See "Source stays waiting" in
[troubleshooting.md](troubleshooting.md).

## Leave out their own servers

If their own servers call the site through the edge (for example server-side
rendering that reads its own API), those calls would show as visitors. Give the
servers a long random secret header on their own calls, and skip requests that
carry it: the edge's `ignoreRequest`, or the server SDKs'
`ignoreIncomingRequest` (Node), `IgnoreIncomingRequest` (Go) and
`ignore_incoming_request` (Python). Check the value is set before comparing;
an unset value would skip every request without the header. Guide:
<https://www.agentrail.co/docs/guides/journeys-own-servers.md>.
