# Agent feedback and a test report (`feedback_setup`, `test_report`)

Live guide: <https://www.agentrail.co/docs/guides/feedback.md>

A feedback project gives agents a public page and address where they report
what blocked or confused them in the product, with no account and no key.
`feedback_setup` is done when a project that accepts reports has a named
placement or a real report. `test_report` is done when a project has received
any report, a test included.

## Contents

1. Create the project (Admin, browser)
2. Get the addresses
3. Put invitations where agents get stuck
4. Name the placements
5. Send a test report
6. Check it

## 1. Create the project (Admin, browser)

1. In <https://app.agentrail.co>, open **Feedback** and select **New project**.
2. **Product name**: how agents see the product named. **Address**: 3 to 40
   lowercase letters, digits and hyphens, starting with a letter.
   **Invitation**: optional; leave it empty for the default.
3. Select **Create project**.

**The address is permanent once the first report arrives, a test report
included, and can never be reused.** Agree it with the person before they
create the project, and before you send the test report.

## 2. Get the addresses

`agentrail feedback list-projects`, then `agentrail feedback get-project
--project-id <id>` (MCP: `feedback_list_projects`, `feedback_get_project`). It
returns the **hosted page** (`https://feedback.agentrail.co/p/<address>`), the
**project card** and the **collection endpoint**, and whether the project takes
only signed reports. The project's **Setup** tab shows the same under **Your
addresses**.

## 3. Put invitations where agents get stuck

On the project's **Setup** tab, **Invite agents to report** has a kit for each
place the product meets agents: **Website**, **API**, **MCP server** and
**CLI**. Pick the kits that match what `detect-project.mjs` found. For each:

1. Ask the person to select **Copy prompt** on that kit and paste it here. The
   prompt holds the project's addresses and the placement labels; it holds no
   secret.
2. Apply it in the repository, as it says. Show the person the changes.

Where the kits put the invitation: help and docs footers, the 404 and error
pages, `llms.txt`, a `feedback` field on API 5xx, 404 and 405 answers, the MCP
server's instructions and its unexpected-error results, and the CLI's `--help`
footer and crash message. Never on validation errors, sign-in failures, rate
limits or successful answers.

The **API** kit's signed forwarding and the **MCP server** kit's handler sign
each report and need a signing secret: the Admin selects **Create secret**
under **Signing secrets**, puts it straight into the variable
`AGENTRAIL_FEEDBACK_SECRET` where the server runs, and selects **I have copied
it**. Never through the chat.

If the person cannot copy a prompt, you can still add plain links to the hosted
page from the addresses in step 2: a footer line on help pages and the 404
page, and one line in `llms.txt`, each linking to
`<hosted page>?invite=<label>` with a short label such as `docs` or `not-found`.

## 4. Name the placements

Views are counted only for named placements. On the project page, under
**Placements**, the Admin adds the kits' labels from **From the kits**, or types
a label and selects **Add placement**. A named placement on an accepting project
completes `feedback_setup`. Check with `agentrail feedback list-placements
--project-id <id>`.

## 5. Send a test report

Only once the address is final (a test report fixes it). Pick one:

- **From here** (quickest), with Node 18 or later:

  ```sh
  node <this skill's folder>/scripts/send-test-report.mjs <hosted page, card or collection address>
  ```

  It reads the project card, refuses if the project is paused, sends one report
  marked `"test": true` and prints the receipt. For a project that takes only
  signed reports, set `AGENTRAIL_FEEDBACK_SECRET` in the environment first; it
  signs the report with it.
- **Through their own kit**, which proves the installed code: the person selects
  **Copy test prompt** under **Test your setup** and pastes it here; run what it
  says (`forwardFeedback(..., { test: true })` or `sendTestReport()`).
- **From the hosted page**: the person selects **Send a test report**, which
  opens the page in test mode.

A test report lands in **Reports** with a **Test** badge and is left out of
every count.

## 6. Check it

1. Read the checklist: `test_report` should be `done`, and `feedback_setup`
   `done` once a placement is named.
2. `agentrail feedback list-reports --project-id <id>` shows the report with
   `"test": true`.
3. A `waiting` `feedback_setup` means the project is accepting but has no named
   placement and no real report yet: do step 4.
