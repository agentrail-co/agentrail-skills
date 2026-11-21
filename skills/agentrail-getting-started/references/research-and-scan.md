# Company research and the first readiness scan

Live guides: <https://www.agentrail.co/docs/guides/brand-vault.md>,
<https://www.agentrail.co/docs/guides/agent-readiness.md>

Both run in the background. Start them, tell the person, and carry on with the
next step while they run. Come back to check them.

## Company research (`research`)

**Finish setup** starts it. It reads the website, the docs and, if GitHub is
connected, the repositories, and fills the **Brand Vault** with the company,
its products and the surfaces agents use (website, web app, sign-up, API, MCP
server). Those surfaces decide whether the browser, server, sign-in and MCP
steps apply.

| State       | What to do                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `waiting`   | Research is running. Carry on with other steps.                                                              |
| `done`      | The Brand Vault has its first version. Read the checklist again: steps that were `waiting_on_research` now apply or not. |
| `attention` | `research_failed`. An Admin opens **Brand Vault** in the sidebar, reads the cause, and selects **Research again**. |

**A step says "not needed" but the product has that surface** (for example
`no_mcp_server` while the repository has an MCP server): research missed it.
Either an Admin corrects the surface in the **Brand Vault**, or you install that
step's source anyway. An installed source always makes its step apply.

## First readiness scan (`readiness_scan`)

A scan checks how well agents can find, read and use the public website, docs
and API, and gives a score out of 100 with the fixes behind it. Any member can
start one. It fetches their sites over the internet, so ask first.

It scans the website given when the workspace was created, plus any
documentation and application URLs in the readiness settings. Don't ask the
person for a URL: `agentrail readiness get-settings` shows what it will scan.

1. Start it: `agentrail readiness start-scan` (MCP: `readiness_start_scan`).
   It returns the scan at once, or the one already running; calling it twice
   never starts a second. In the web app: **Agent readiness**, then **Scan
   now**.
2. Note the scan's `id`. Carry on with other steps.
3. Come back every few minutes: `agentrail readiness get-scan --scan-id <id>`
   (MCP: `readiness_get_scan`) until its state is `ended`.
4. Tell the person the score, the grade and the top three fixes from the
   result. Do not start fixing them now; that is day-to-day work after setup.

If the checklist says `applies: no` with `readiness_off`, readiness is off for
the workspace. An Admin turns it on in **Agent readiness** › **Settings**
(**Readiness** on, then **Save**; saving with readiness on starts a scan). To
scan the docs or the app as well as the website, the Admin adds them under
**Documentation and application URLs** on the same page.

Scans then repeat on their own, every 7 days by default.
