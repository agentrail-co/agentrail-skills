# Python server SDK (`servers`, `sign_in`, `mcp_calls`)

Live guides: <https://www.agentrail.co/docs/guides/journeys-python.md>,
<https://www.agentrail.co/docs/guides/journeys-python-reference.md>

`agentrail-python` records the requests the server answers and its outgoing
calls, the identity the app verified, milestones, logs and MCP tool calls, for
FastAPI, Django, Flask and any ASGI or WSGI app. It needs Python 3.10 or later.
First read [sources.md](sources.md): the Admin creates a **Your servers**
source, and `AGENTRAIL_SECRET` and `AGENTRAIL_HASH_KEY` are set where the
server runs.

## Contents

1. Install and start it
2. Record sign-in
3. Record MCP calls
4. Optional
5. Check it

## 1. Install and start it

```sh
pip install agentrail-python
```

Add extras for the libraries the app uses: `pip install
"agentrail-python[httpx,requests,mcp]"`. Use the project's own tool (`uv add`,
`poetry add`) and add it to its dependency file.

Create the client once, when the process starts:

```python
# agentrail_setup.py
import os

import agentrail_python as ar

agentrail = ar.init(
    ar.Options(
        collector=ar.CollectorOptions(
            endpoint="https://api.agentrail.co/ingest/otlp",
            secret=os.environ["AGENTRAIL_SECRET"],
        ),
        hash_key=os.environ["AGENTRAIL_HASH_KEY"],
        service_name="orders-api",
        outbound_origins=[],
        on_error=lambda error: print(error),
    )
)
```

Wrap the app once, around the part that should be recorded. If it is
installed after the authentication middleware, the authentication step itself
is not recorded.

```python
# FastAPI
from agentrail_python.asgi import AgentrailASGIMiddleware
app.add_middleware(AgentrailASGIMiddleware, client=agentrail)

# Django (asgi.py), or agentrail.wsgi(...) in wsgi.py
application = agentrail.asgi(get_asgi_application())

# Flask
app.wsgi_app = agentrail.wsgi(app.wsgi_app)
```

Outgoing calls: wrap the clients the handlers use, for example
`httpx.Client(transport=transport(agentrail))` with
`from agentrail_python.httpx import transport`.

If the process already has an OpenTelemetry provider, `init` refuses to
replace it; use `create_processors` as the package's README describes. For
worker processes (gunicorn, uvicorn workers), read the reference's notes
before choosing where `init` runs.

## 2. Record sign-in (`sign_in`)

After the app has authenticated a request:

```python
agentrail.identify(ar.VerifiedIdentity(kind="user", id=user.id))
```

Kinds: `user`, `agent_registration`, `agent_instance`, `oauth_client`,
`api_key`; add `acting_user_id` for an agent acting for a person. Only verified
identities.

## 3. Record MCP calls (`mcp_calls`), if there is an MCP server

```python
from agentrail_python.mcp import mcp_capture

capture = mcp_capture(agentrail)
server = MCPServer("orders", middleware=[capture.middleware])
server.tool(name="checkout")(capture.tool("checkout", checkout))
```

Serve it behind the middleware, as
`agentrail.asgi(server.streamable_http_app(stateless_http=True))`, so each call
joins its request. `capture.resource` and `capture.prompt` wrap the others.

## 4. Optional

Milestones (`agentrail.milestone`, `start_milestone`, `with_milestone`), logs
(`AgentrailHandler`), location (`incoming_location`) and leaving out their own
servers (`ignore_incoming_request`, see [sources.md](sources.md)). See the guide.

## Check it

1. Start the server with the variables set and send it one request.
2. Nothing reaches `on_error`.
3. Read the checklist: `servers` should be `done`.

`sign_in` and `mcp_calls` turn `done` as soon as the SDK sends, because the SDK
reports that it records them. To prove `identify` and the MCP wrapping run, sign
in once (and call one MCP tool), then open the newest journey in **Journeys**:
it should read **Signed in with a … account** (or show **Signed-in account**),
and an MCP call shows as an event named **Called <tool>**.
