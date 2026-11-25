# The public agent readiness API, called by hand

Read this when `scripts/check-readiness.mjs` cannot run: there is no Node.js,
or no shell but there is a way to make HTTP requests. These are the calls the
script makes, and the calls the checker page makes from the visitor's browser.

Live guides:
<https://www.agentrail.co/docs/api-reference/leaderboard/get-leaderboard-company.md>,
<https://www.agentrail.co/docs/api-reference/leaderboard/start-leaderboard-scan.md>,
<https://www.agentrail.co/docs/api-reference/leaderboard/get-leaderboard-scan.md>.
If they disagree with this file, follow them.

Base URL: `https://api.agentrail.co`. No route here takes a login, token or
API key: send no `Authorization` header. Errors all have the body
`{ "code": "…", "message": "…", "requestId": "…" }`; tell the person the
`message`.

## 1. Read the current result

`domain` is the site's host in lowercase, without `www.`: `https://www.Example.com/docs` is `example.com`.

```sh
curl -s "https://api.agentrail.co/v1/leaderboard/companies/example.com?community=include"
```

- **404:** the site has never been scanned. Go to 2.
- **200** with `scannedAt` less than 7 days ago: report this result and start
  no scan. The checker does the same, and it costs none of the day's 10
  scans. If the person wants a fresh scan anyway, go to 2.
- **200** with `scannedAt` null or older: go to 2.

The fields step 4 of the skill reports: `score`, `grade`, `rank`,
`rankedCompanies`, `category.name`, `categoryRank`, `previousScan`, `summary`,
`layers` (each `id`, `score` out of `weight`; a null `score` means no check
applied), and `checks`. A check counts toward the score only when its `label`
is null. Of those, the ones to fix are `status` `failed` or `warning` with
`earned` below `points`. Put `tier` `required` first, then the most points
lost. A check with `bonus: true` only ever adds points.

## 2. Start the scan

```sh
curl -s -i -X POST https://api.agentrail.co/v1/leaderboard/scans \
  -H 'content-type: application/json' \
  -d '{"url":"example.com","email":"person@example.com"}'
```

Leave `email` out when the person gave none. Put the address and the email in
the JSON as they typed them, with any `"` or `\` escaped. No other field is
accepted. When given, the email is sent once when the scan ends, however it
ends.

- **202:** `{ "started": true, "scan": { "id": "…", "state": "waiting" }, "domain": "example.com" }`.
  `started: false` means you joined the scan already running for that site;
  the email still goes out when it ends.
- **400:** the address cannot be scanned: not a public web address, a port in
  it, no DNS records, or a private network address.
- **429:** this network address has started its 10 scans in the last 24
  hours. Every start counts, including joins and refusals. The message says
  when the next one frees up.
- **503:** the name lookup timed out. Try again.

## 3. Read the scan until it ends

```sh
curl -s https://api.agentrail.co/v1/leaderboard/scans/<scan id>
```

Read it every 5 seconds or more, as the checker page does, until `state` is
`ended`. Before that, `state` is `waiting`, `running` or `scoring`, and the
last of `events` is the step it is on. A read that fails is simply asked
again. A scan usually ends within a few minutes, and has a budget of about 10.

When `state` is `ended`, `ending` says how:

- `finished`: `score` and `grade` are set. Read 1 again for the full result.
- `failed` or `interrupted`: no score. `cause` says why.
- `sign_in_required`: the MCP server or MCP App needs a sign-in, so it has no
  score.

## Links for the person

- While it runs: `https://www.agentrail.co/agent-readiness/<domain>?scan=<scan id>`
- The report: `https://www.agentrail.co/agent-readiness/<domain>`
- The checker with their address filled in:
  `https://www.agentrail.co/agent-readiness/checker?url=<website>`
