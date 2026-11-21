# Go server SDK (`servers`, `sign_in`, `mcp_calls`)

Live guides: <https://www.agentrail.co/docs/guides/journeys-go.md>,
<https://www.agentrail.co/docs/guides/journeys-go-reference.md>

`agentrail-go` records the requests the server answers and its outgoing calls,
the identity the app verified, milestones, logs and MCP tool calls. First read
[sources.md](sources.md): the Admin creates a **Your servers** source, and
`AGENTRAIL_SECRET` and `AGENTRAIL_HASH_KEY` are set where the server runs.

## Contents

1. Install and start it
2. Record sign-in
3. Record MCP calls
4. Optional
5. Check it

## 1. Install and start it

```sh
go get github.com/agentrail-co/agentrail-go@latest
```

Create the capture once at startup, wrap the handler, and wrap the HTTP
clients whose calls belong to the journey:

```go
capture, err := agentrail.New(ctx, agentrail.Options{
	Collector: agentrail.CollectorOptions{
		Endpoint: "https://api.agentrail.co/ingest/otlp",
		Secret:   os.Getenv("AGENTRAIL_SECRET"),
	},
	HashKey:         os.Getenv("AGENTRAIL_HASH_KEY"),
	ServiceName:     "orders-api",
	OutboundOrigins: []string{},
	OnError: func(ctx context.Context, issue agentrail.CaptureError) {
		slog.ErrorContext(ctx, "agentrail", "code", issue.Code)
	},
})
if err != nil {
	return err
}

server := &http.Server{Addr: ":8080", Handler: capture.Middleware(mux)}
inventory := &http.Client{Transport: capture.Transport(nil)}
```

- `New` never reads environment variables itself and returns an error when an
  option is wrong, so check both variables are set before calling it.
- Install `Middleware` once. If the app already traces incoming requests with
  `otelhttp`, replace that for this scope, or each request is recorded twice.
- `OutboundOrigins`: exact origins of their own services only.
- An existing OpenTelemetry provider: use `NewProcessors` and `Bind`, as the
  module's README describes.

## 2. Record sign-in (`sign_in`)

After the app has authenticated a request:

```go
err := capture.Identify(r.Context(), agentrail.VerifiedIdentity{
	Kind: agentrail.PrincipalUser,
	ID:   user.ID,
})
```

Kinds: `PrincipalUser`, `PrincipalAgentRegistration`, `PrincipalAgentInstance`,
`PrincipalOAuthClient`, `PrincipalAPIKey`. Add `ActingUserID` for an agent
acting for a person. Only verified identities.

## 3. Record MCP calls (`mcp_calls`), if there is an MCP server

```go
import capturemcp "github.com/agentrail-co/agentrail-go/mcp"

sdk.AddTool(server, &sdk.Tool{Name: "confirm_order"},
	capturemcp.Tool(capture, "confirm_order", confirmOrder))
```

`capturemcp.ToolHandler`, `capturemcp.Resource` and `capturemcp.Prompt` wrap the
others. It targets the official MCP Go SDK 1.8.0.

## 4. Optional

Milestones (`capture.WithMilestone`), `slog` logs
(`agentrailslog.NewHandler(capture, existingHandler)`), an approximate location
(`IncomingLocation`), and leaving out their own servers
(`IgnoreIncomingRequest`, see [sources.md](sources.md)). See the guide.

## Check it

1. `go build ./...`, start the server with the variables set, and send it one
   request.
2. Nothing reaches `OnError`.
3. Read the checklist: `servers` should be `done`.

`sign_in` and `mcp_calls` turn `done` as soon as the SDK sends, because the SDK
reports that it records them. To prove your `Identify` call and MCP wrapping
run, sign in once (and call one MCP tool), then open the newest journey in
**Journeys**: it should read **Signed in with a … account** (or show
**Signed-in account**), and an MCP call shows as an event named **Called
<tool>**.
