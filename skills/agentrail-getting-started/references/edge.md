# Record every request with the edge (`every_request`)

Live guide: <https://www.agentrail.co/docs/guides/journeys-edge.md>

The edge (`agentrail-edge`) runs in front of the site, records one event for
every request once the answer has gone back, and never slows or breaks the
answer. First read [sources.md](sources.md): the Admin creates an **Edge**
source and puts `AGENTRAIL_SECRET` and `AGENTRAIL_HASH_KEY` in the platform's
secrets.

## Contents

- Pick the platform
- Cloudflare Workers
- Vercel
- Before you finish the code
- Check it

## Pick the platform

The edge runs on **Cloudflare Workers** or **Vercel** (Routing Middleware, or
`proxy.ts` on Next.js 16). Use what `detect-project.mjs` found:

- `wrangler.toml`, `wrangler.json` or `wrangler.jsonc`, or the domain is on
  Cloudflare: Cloudflare Workers.
- `vercel.json`, `.vercel/`, or a Next.js app deployed on Vercel: Vercel.
- Neither: ask where the site is hosted. If the domain's DNS is on Cloudflare,
  a Worker on a route in front of the site works for any host. Otherwise there
  is no edge for that host yet: say so, leave `every_request` to do, and go on.
  The browser script and the server SDK still record.

`hosts` lists the site's own hosts. Use the real ones, such as
`'www.example.com'` and `'docs.example.com'`, each with `'query'` (or `'path'`
for a host whose calls an extra query parameter would break).

## Cloudflare Workers

```sh
npm install agentrail-edge
npx wrangler secret put AGENTRAIL_SECRET
npx wrangler secret put AGENTRAIL_HASH_KEY
```

The person runs the two `wrangler secret put` commands and pastes each value
when wrangler asks, not into the chat.

```js
import { cloudflare, createEdge } from 'agentrail-edge';

let edge;

export default {
  fetch(request, env, ctx) {
    edge ??= createEdge({
      collector: {
        endpoint: 'https://api.agentrail.co/ingest/events',
        secret: env.AGENTRAIL_SECRET,
      },
      hashKey: env.AGENTRAIL_HASH_KEY,
      hosts: { 'docs.example.com': 'query' },
    });
    return edge.handle(request, cloudflare(ctx));
  },
};
```

Deploy it on a route in front of the site. Create the edge once, on the first
request, as this does.

## Vercel

```sh
npm install agentrail-edge @vercel/functions
```

The person adds `AGENTRAIL_SECRET` and `AGENTRAIL_HASH_KEY` to the Vercel
project's environment variables (and to the git-ignored env file for local
runs).

```ts
// middleware.ts at the project root (Next.js 16: proxy.ts, exporting `proxy`)
import { waitUntil } from '@vercel/functions';
import { createEdge, vercel } from 'agentrail-edge';

const edge = createEdge({
  collector: {
    endpoint: 'https://api.agentrail.co/ingest/events',
    secret: process.env.AGENTRAIL_SECRET,
  },
  hashKey: process.env.AGENTRAIL_HASH_KEY,
  hosts: { 'www.example.com': 'query' },
});

export default function middleware(request) {
  return edge.handle(
    request,
    vercel({
      waitUntil,
      origin: (forwarded) => {
        const url = new URL(forwarded.url);
        // An address of the site that this middleware does not run on.
        url.hostname = 'YOUR_ORIGIN_HOST';
        return fetch(new Request(url, forwarded));
      },
    }),
  );
}
```

Middleware cannot change an answer it passes on, so `origin` fetches the site
itself. `YOUR_ORIGIN_HOST` must be an address of the same site that this
middleware does not run on (a fetch to the same address would come back
through the middleware). Ask the person for it; never guess one. If the project
already has a middleware or `proxy.ts`, merge into it rather than replacing it,
and keep its `config.matcher`.

## Before you finish the code

- If the edge rewrites a request's path or query, do it in the adapter's
  `prepareOriginRequest(request)`, so it happens before the edge signs the
  request for the servers.
- If their own servers call the site through the edge, add `ignoreRequest`
  (see [sources.md](sources.md)).
- Optional: `identify(request)` returns a verified identity from the site's own
  auth check (`{ kind: 'user', id }`), never from what a caller merely claims.

## Check it

1. Deploy it, or run the site locally where the middleware or Worker runs
   (`npx wrangler dev`, `next dev`), and request one page.
2. Read the checklist: `every_request` should be `done`.
3. If the browser script was installed first, `every_request` was `attention`
   with `browser_only`. It clears once the edge sends.
