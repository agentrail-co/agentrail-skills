# Node server SDK (`servers`, `sign_in`, `mcp_calls`)

Live guides: <https://www.agentrail.co/docs/guides/journeys-node.md>,
<https://www.agentrail.co/docs/guides/journeys-node-reference.md>

`agentrail-node` records the requests the server answers and the calls it makes
while answering them, the identity the app verified, milestones, logs and MCP
tool calls. It needs Node 22 or later. First read [sources.md](sources.md): the
Admin creates a **Your servers** source, and `AGENTRAIL_SECRET` and
`AGENTRAIL_HASH_KEY` are set where the server runs.

## Contents

1. Install and start it
2. Record sign-in
3. Record MCP calls
4. Optional
5. Check it

## 1. Install and start it

```sh
npm install agentrail-node
```

Create `instrumentation.ts` (or `.js`) and load it before the app's HTTP
modules:

```ts
// instrumentation.ts
import { init } from 'agentrail-node';

const secret = process.env.AGENTRAIL_SECRET;
const hashKey = process.env.AGENTRAIL_HASH_KEY;
if (!secret || !hashKey) throw new Error('Agentrail is not configured');

export const agentrail = await init({
  collector: { endpoint: 'https://api.agentrail.co/ingest/otlp', secret },
  hashKey,
  serviceName: 'orders-api',
  outboundOrigins: [],
  onError(error) {
    console.error(error);
  },
});
```

```sh
node --import ./instrumentation.js app.js
```

- `serviceName`: this service's name; use the repository's or deployment's.
- `outboundOrigins`: the exact origins of their own services this server calls
  that should receive the trace. Default none. Never list third parties.
- Put the `--import` in the start script the platform runs (the `start` script
  in `package.json`, the Dockerfile's `CMD`, the Procfile).
- If the app already has an OpenTelemetry provider, `init` refuses to start.
  Use `createProcessors` instead, as the reference's "An existing
  OpenTelemetry setup" describes.
- If a framework owns the server process (serverless functions, Next.js),
  read the reference before choosing where `init` runs.

On shutdown, call `await agentrail.shutdown()` so queued records are sent.

## 2. Record sign-in (`sign_in`)

After the app has authenticated a request, tell Agentrail who it was. Find the
place the app resolves the signed-in user, API key or OAuth client, and add:

```ts
agentrail.identify({ kind: 'user', id: user.id });
```

`kind` is `user`, `agent_registration`, `agent_instance`, `oauth_client` or
`api_key`. For an agent acting for a person, also pass `actingUserId`. IDs are
hashed before they leave the server. Only call it with an identity the app
verified, never one a caller only claims.

## 3. Record MCP calls (`mcp_calls`), if the repository has an MCP server

```ts
import { mcp } from 'agentrail-node/mcp';

const capture = mcp({ client: agentrail });
server.registerTool('checkout', {}, capture.tool('checkout', checkout));
```

Wrap every registered tool the same way, and resources and prompts with
`capture.resource` and `capture.prompt`. It targets `@modelcontextprotocol/server`
2.3.1. Arguments, results and prompt text are not recorded.

## 4. Optional

- Milestones: `await agentrail.milestone('checkout.confirm', { surface: 'custom', kind: 'checkout.confirm' }, () => confirmOrder())`.
- Logs from Pino: `pinoLogger({ hooks: pino(agentrail) })` with
  `import { pino } from 'agentrail-node/pino'`.
- Their own servers' calls: `ignoreIncomingRequest`, see [sources.md](sources.md).

## Check it

1. Start the server with the variables set, locally or deployed, and send it
   one request.
2. `agentrail.diagnostics()` reports spans `accepted`, `exported`, `dropped`
   and `pending`. `exported` above 0 means the collector took them. Anything
   in `onError` names the problem.
3. Read the checklist: `servers` should be `done`.

`sign_in` and `mcp_calls` turn `done` as soon as the SDK sends, because the SDK
reports that it is set up to record them. That does not prove your
`identify` call or MCP wrapping runs. To prove it, sign in to the app once (and
call one MCP tool, if there is a server), then open **Journeys** in Agentrail.
The newest journey should read **Signed in with a … account** (or show
**Signed-in account**), and an MCP call shows as an event named **Called
<tool>**. Tell the person what you checked.
