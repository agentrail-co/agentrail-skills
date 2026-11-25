#!/usr/bin/env node
// Runs the same agent readiness scan as https://www.agentrail.co/agent-readiness/checker,
// through Agentrail's public API. It needs no Agentrail account, login or API key, and
// sends none.
//
// It works as the checker does. First it reads the site's current result: one scored in the
// last 7 days is shown, and no scan starts (that costs none of the 10 scans a day). Otherwise it
// starts a scan, or joins the one already running for that site, and follows it until it ends.
//
// Usage:
//   node check-readiness.mjs <website> [--email <address>] [--rescan] [--wait <seconds>]
//   node check-readiness.mjs --scan-id <id> [--wait <seconds>]
//
//   --email    Email the result to this address when the scan ends. It is sent once,
//              however the scan ends, and only when a scan runs.
//   --rescan   Start a scan even when there is a result from the last 7 days.
//   --wait     How long to follow the scan before handing back, in seconds. Default 100.
//              0 hands back at once. The scan keeps running either way.
//   --scan-id  Follow a scan started earlier.
//
// Prints one JSON object on stdout; progress goes to stderr. Exit 0: a result, or a scan
// still running (run again with --scan-id). Exit 1: refused or unreachable. Exit 2: wrong usage.

import { parseArgs } from 'node:util';

const API = process.env.AGENTRAIL_API_URL || 'https://api.agentrail.co';
const REPORTS = 'https://www.agentrail.co/agent-readiness';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// The checker page reads a running scan every 5 seconds. Tests set it lower.
const POLL_MS = Number(process.env.AGENTRAIL_POLL_MS) || 5_000;
const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_WAIT_SECONDS = 100;
const USER_AGENT = 'agentrail-check-readiness-skill';
// The API's own form of a scan id, and the checker's own test of an email address.
const SCAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// What each step of a scan does, as the checker's progress log says it.
const STEPS = {
  waiting: 'In line to start',
  reading: 'Starting to read the site',
  robots: 'Reading robots.txt: what agents are allowed',
  homepage: 'Opening the homepage in Chrome',
  indexes: 'Reading sitemap.xml and llms.txt',
  agent_views: 'Loading the homepage as GPTBot, ClaudeBot and PerplexityBot',
  mcp: 'Looking for an MCP server',
  dns: 'Checking DNS for agent records',
  agent_files: 'Reading the files agents look for (/.well-known, agents.md, pricing.md)',
  api_descriptions: 'Following API descriptions and agent cards (OpenAPI, A2A, OAuth)',
  probes: 'Trying the API, sign-in and MCP App endpoints (read-only)',
  pages: "Reading the rest of the site's pages",
  scoring: 'Reading done, handing over to scoring',
  product_facts: 'Working out what the product is',
  developer_checks: 'Checking the developer docs and portal',
  lookups: 'Looking the company up (search, Wikipedia, npm, PyPI, MCP registries)',
  checks: 'Running the checks',
  summary: 'Writing the one-line summary',
  ended: 'Done',
};

const USAGE =
  'Usage: node check-readiness.mjs <website> [--email <address>] [--rescan] [--wait <seconds>]\n' +
  '       node check-readiness.mjs --scan-id <id> [--wait <seconds>]\n';

function finish(result, code = 0) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(code);
}

function usage(message) {
  process.stderr.write(`${message}\n${USAGE}`);
  process.exit(2);
}

/** A problem that ends the run: the API could not be reached, or answered what it never should. */
function unavailable(message) {
  process.stderr.write(`${message}\n`);
  finish({ outcome: 'unavailable', message }, 1);
}

const progress = (line) => process.stderr.write(`${line}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The domain the API files an address under: its host, lowercase, without `www.`. */
function domainOf(address) {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(address) ? address : `https://${address}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/\.+$/, '').replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}

const reportUrl = (domain) => `${REPORTS}/${encodeURIComponent(domain)}`;
const watchUrl = (domain, scanId) => `${reportUrl(domain)}?scan=${encodeURIComponent(scanId)}`;

class Unreachable extends Error {}

async function request(path, init = {}) {
  const url = new URL(path, API);
  try {
    return await fetch(url, {
      ...init,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT, ...init.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Unreachable(`Could not reach ${url.origin}: ${error.cause?.code ?? error.message}`);
  }
}

async function bodyOf(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/** A listed company's current result, as its public page shows it. Undefined when it is not listed. */
async function readCompany(domain) {
  const response = await request(`/v1/leaderboard/companies/${encodeURIComponent(domain)}?community=include`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Unreachable(`Reading the result for ${domain} answered HTTP ${response.status}.`);
  return response.json();
}

function ago(iso) {
  const hours = Math.max(0, (Date.now() - Date.parse(iso)) / 3_600_000);
  if (hours < 1) return 'less than an hour ago';
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const TIERS = { required: 0, recommended: 1, emerging: 2 };

/** What a person needs from a company's result: the score, where it stands, and what lost points. */
function resultOf(company, scan) {
  const checks = company.checks ?? [];
  // Checks labelled emerging or beta run and show, but never count toward the score.
  const counted = checks.filter((check) => check.label === null);
  const missed = counted
    .filter((check) => (check.status === 'failed' || check.status === 'warning') && check.points > check.earned)
    .sort(
      (a, b) =>
        TIERS[a.tier] - TIERS[b.tier] || b.points - b.earned - (a.points - a.earned) || a.name.localeCompare(b.name),
    );
  const statuses = {};
  for (const check of counted) statuses[check.status] = (statuses[check.status] ?? 0) + 1;
  return {
    domain: company.domain,
    score: scan?.score ?? company.score,
    grade: scan?.grade ?? company.grade,
    scannedAt: scan?.endedAt ?? company.scannedAt,
    rank: company.rank,
    rankedCompanies: company.rankedCompanies,
    category: company.category?.name ?? null,
    categoryRank: company.categoryRank,
    categoryRankedCompanies: company.categoryRankedCompanies,
    sincePreviousScan: company.previousScan,
    summary: company.summary,
    layers: (company.layers ?? []).map((layer) => ({ layer: layer.id, score: layer.score, outOf: layer.weight })),
    // A bonus check only ever adds to the score, so missing one costs nothing.
    toFix: missed
      .filter((check) => !check.bonus)
      .map((check) => ({
        check: check.name,
        layer: check.layer,
        tier: check.tier,
        status: check.status,
        earned: check.earned,
        points: check.points,
      })),
    bonusMissed: missed.filter((check) => check.bonus).map((check) => check.name),
    countedChecks: { total: counted.length, ...statuses },
    reportUrl: reportUrl(company.domain),
  };
}

/** Starts a scan, or joins the one already running. A refusal ends the run with the API's own sentence. */
async function startScan(url, email) {
  const response = await request('/v1/leaderboard/scans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(email ? { url, email } : { url }),
  });
  const body = await bodyOf(response);
  if (response.status === 202) return body;
  if (response.status === 400 || response.status === 429 || response.status === 503) {
    const message = body.message ?? `The scan was refused (HTTP ${response.status}).`;
    process.stderr.write(`The scan was refused: ${message}\n`);
    finish({ outcome: 'refused', status: response.status, code: body.code ?? null, message }, 1);
  }
  throw new Unreachable(`Starting the scan answered HTTP ${response.status}.`);
}

/**
 * Reads the scan until it ends or `deadline` passes, saying each new step on stderr. A read
 * that fails is asked again on the next tick, as the checker page does.
 */
async function follow(scanId, deadline) {
  let last;
  let said = -1;
  for (;;) {
    try {
      const response = await request(`/v1/leaderboard/scans/${encodeURIComponent(scanId)}`, { cache: 'no-store' });
      if (response.status === 404 || response.status === 400)
        finish({ outcome: 'not_found', scanId, message: `There is no scan with the id ${scanId}.` }, 1);
      if (response.ok) last = await response.json();
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
    }
    if (last) {
      const events = last.events ?? [];
      // A run that follows a scan started earlier says only where it is now, then each new step.
      if (said === -1) said = Math.max(0, events.length - 1);
      for (const event of events.slice(said)) progress(`· ${STEPS[event.step] ?? event.step}`);
      said = events.length;
      if (last.state === 'ended') return last;
    }
    if (Date.now() + POLL_MS > deadline) return last;
    await sleep(POLL_MS);
  }
}

function emailNote(email, ran) {
  if (!email) return null;
  return ran ? 'requested: sent once when the scan ends' : 'not sent: no scan ran';
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        email: { type: 'string' },
        rescan: { type: 'boolean', default: false },
        wait: { type: 'string' },
        'scan-id': { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    usage(error.message);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const wait = values.wait === undefined ? DEFAULT_WAIT_SECONDS : Number(values.wait);
  if (!Number.isFinite(wait) || wait < 0 || wait > 3600) usage('--wait takes a number of seconds from 0 to 3600.');
  const deadline = Date.now() + wait * 1000;

  const scanIdOption = values['scan-id']?.trim();
  if (scanIdOption !== undefined) {
    if (positionals.length > 0 || values.email !== undefined || values.rescan)
      usage('--scan-id follows a scan started earlier; give it alone, with --wait if you like.');
    if (!SCAN_ID.test(scanIdOption)) usage(`"${scanIdOption}" is not a scan id.`);
    return report(scanIdOption, deadline, { email: undefined });
  }

  if (positionals.length !== 1) usage('Give one website address, such as example.com.');
  const address = positionals[0].trim();
  if (!address || address.length > 2048 || /\s/.test(address) || !domainOf(address))
    usage(`"${positionals[0]}" is not a website address. Give one such as example.com.`);
  const email = values.email?.trim();
  if (values.email !== undefined && (!email || email.length > 254 || !EMAIL.test(email)))
    usage(`"${values.email}" is not an email address.`);

  if (!values.rescan) {
    const domain = domainOf(address);
    const company = await readCompany(domain);
    if (company?.scannedAt && Date.now() - Date.parse(company.scannedAt) < WEEK_MS) {
      finish({
        outcome: 'recent',
        ...resultOf(company),
        email: emailNote(email, false),
        note: `Scored ${ago(company.scannedAt)}, so no new scan started, as the checker does. Run again with --rescan to scan it now.`,
      });
    }
  }

  const started = await startScan(address, email);
  const scanId = started.scan.id;
  progress(
    started.started
      ? `Started a scan of ${started.domain} (scan ${scanId}).`
      : `Joined the scan of ${started.domain} already under way (scan ${scanId}).`,
  );
  progress(`Watch it at ${watchUrl(started.domain, scanId)}`);
  return report(scanId, deadline, { email, started: started.started, domain: started.domain, state: started.scan.state });
}

async function report(scanId, deadline, context) {
  const scan = Date.now() < deadline || context.state === undefined ? await follow(scanId, deadline) : undefined;
  const domain = scan?.domain ?? context.domain;
  const email = emailNote(context.email, true);
  const joined = context.started === undefined ? {} : { joinedRunningScan: !context.started };

  if (!scan || scan.state !== 'ended') {
    finish({
      outcome: 'running',
      scanId,
      domain,
      state: scan?.state ?? context.state ?? 'unknown',
      step: scan?.events?.length ? STEPS[scan.events.at(-1).step] ?? scan.events.at(-1).step : null,
      ...joined,
      email,
      watchUrl: domain ? watchUrl(domain, scanId) : null,
      next: `node "${process.argv[1]}" --scan-id ${scanId}`,
    });
  }

  if (scan.ending === 'finished') {
    const company = await readCompany(scan.domain);
    if (company) finish({ outcome: 'finished', scanId, ...joined, ...resultOf(company, scan), email });
    finish({ outcome: 'finished', scanId, ...joined, domain, score: scan.score, grade: scan.grade, reportUrl: reportUrl(domain), email });
  }

  // failed, interrupted, or sign_in_required: no score, and `cause` says why in our own words.
  finish({
    outcome: scan.ending,
    scanId,
    ...joined,
    domain,
    cause: scan.cause,
    endedAt: scan.endedAt,
    reportUrl: reportUrl(domain),
    email,
  });
}

main().catch((error) => {
  if (error instanceof Unreachable) unavailable(error.message);
  throw error;
});
