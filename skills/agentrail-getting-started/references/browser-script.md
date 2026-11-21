# Add the browser script (`browser_script`)

Live guide: <https://www.agentrail.co/docs/guides/journeys-browser.md>

The browser script (`agentrail-browser`) records page views, the pages' calls
to their own services, and WebMCP tool calls, by people and by agents driving
a browser. First read [sources.md](sources.md): the Admin creates a **Browser
script** source and copies the **Browser script tag**. Its key (`ajp_…`) is
public, so the tag may be pasted into the chat.

## Ask first

Under **Your API's origins**, the Admin lists the other origins the pages call,
such as `https://api.example.com`, and Agentrail adds them to the tag as
`data-first-party`. Calls to those origins then carry the page's trace in a
`traceparent` header.

**Before adding an origin, add `traceparent` to that API's allowed CORS request
headers**, or browsers will block the pages' calls to it. If you cannot change
that API's CORS settings now, leave its origin out.

## Add it

Choose one:

- **The tag** (any site with a shared layout): put it in the `<head>` of the
  layout every page uses, exactly as the web app gives it:

  ```html
  <script async src="https://api.agentrail.co/agentrail.js" data-key="ajp_…"></script>
  ```

- **Bundled** (a single-page app, or a site that bundles its own scripts):

  ```sh
  npm install agentrail-browser
  ```

  ```js
  import { start } from 'agentrail-browser';

  start({
    key: 'ajp_…',
    collector: 'https://api.agentrail.co/ingest/browser',
    firstParty: ['https://api.example.com'],
  });
  ```

  Call `start` once, as early as possible, in client-side code that runs on
  every page (in React or Next.js, a client component in the root layout).

If the site only loads scripts after a cookie banner is accepted, everyone who
declines leaves no steps; the edge still records them.

## Leave these off unless they ask

- `data-behaviour="on"` (`behaviour: true`) records how a page is used, to tell
  a person from an agent. Their privacy notice must cover it.
- `data-fingerprint="on"` (`fingerprint: true`) identifies the browser. Only for
  visitors who consented; render it only once the consent banner says yes.

If the site also runs the edge with a custom session timeout or domain, give
the script the same `data-session-idle` and `data-session-domain`.

## Check it

1. Load one page of the site in a browser (deployed, or the local dev server).
2. Read the checklist: `browser_script` should be `done`.
3. If the edge is not installed yet, `every_request` now shows `attention` with
   `browser_only`. That is expected until the edge sends.
