import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';

import { ROOT } from './helpers.mjs';

const script = join(ROOT, 'skills', 'agentrail-check-readiness', 'scripts', 'check-readiness.mjs');
const SCAN_ID = '01a19732-078b-7a72-be54-6a5d41c302df';
const HOUR_MS = 60 * 60 * 1000;

function run(args, api) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, AGENTRAIL_API_URL: api, AGENTRAIL_POLL_MS: '10' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr, json: stdout ? JSON.parse(stdout) : undefined }));
  });
}

function company(overrides = {}) {
  return {
    id: '01a136b7-630b-7936-b438-02b08de3ffed',
    name: 'Example',
    website: 'https://example.com/',
    domain: 'example.com',
    category: { id: '01a19732-078b-7a72-be54-6a5d41c302d0', name: 'Developer Tools', slug: 'developer-tools' },
    source: 'community',
    score: 71,
    grade: 'B',
    rank: 40,
    rankedCompanies: 2600,
    categoryRank: 3,
    categoryRankedCompanies: 90,
    scoreChange7d: null,
    rankChange7d: null,
    newThisWeek: true,
    scannedAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    previousScan: null,
    summary: 'Strong access, weak discovery.',
    layers: [
      { id: 'discovery', weight: 20, score: 9 },
      { id: 'payments', weight: 10, score: null },
    ],
    checks: [
      { id: 'a', name: 'Recommended miss', layer: 'usability', tier: 'recommended', label: null, bonus: false, status: 'failed', earned: 0, points: 3 },
      { id: 'b', name: 'Required warning', layer: 'access', tier: 'required', label: null, bonus: false, status: 'warning', earned: 1, points: 2 },
      { id: 'c', name: 'Emerging, never counts', layer: 'access', tier: 'emerging', label: 'emerging', bonus: false, status: 'failed', earned: 0, points: 2 },
      { id: 'd', name: 'Bonus miss', layer: 'discovery', tier: 'recommended', label: null, bonus: true, status: 'failed', earned: 0, points: 4 },
      { id: 'e', name: 'Passed', layer: 'access', tier: 'required', label: null, bonus: false, status: 'passed', earned: 1, points: 1 },
    ],
    ...overrides,
  };
}

/**
 * A stand-in for the public API: the company read, the scan start and the scan read. `scans`
 * is the list of states the scan reads go through; the last one repeats.
 */
async function publicApi({ listed, start = { status: 202 }, scans = [] }) {
  const calls = [];
  let reads = 0;
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      calls.push({ method: request.method, url: request.url, headers: request.headers, body });
      const send = (status, value) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(value));
      };
      if (request.method === 'GET' && request.url.startsWith('/v1/leaderboard/companies/example.com')) {
        const current = typeof listed === 'function' ? listed() : listed;
        return current ? send(200, current) : send(404, { code: 'NOT_FOUND', message: 'company not found', requestId: 'r' });
      }
      if (request.method === 'POST' && request.url === '/v1/leaderboard/scans') {
        if (start.status !== 202) return send(start.status, { code: start.code, message: start.message, requestId: 'r' });
        return send(202, { started: start.started ?? true, scan: { id: SCAN_ID, state: 'waiting' }, domain: 'example.com' });
      }
      if (request.method === 'GET' && request.url === `/v1/leaderboard/scans/${SCAN_ID}`) {
        const scan = scans[Math.min(reads, scans.length - 1)];
        reads += 1;
        return send(200, { id: SCAN_ID, domain: 'example.com', ending: null, cause: null, score: null, grade: null, endedAt: null, events: [], ...scan });
      }
      send(404, { code: 'NOT_FOUND', message: 'no route', requestId: 'r' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, calls, api: `http://127.0.0.1:${server.address().port}` };
}

const at = () => new Date().toISOString();
const running = { state: 'running', events: [{ step: 'waiting', at: at() }, { step: 'robots', at: at() }] };
const finished = {
  state: 'ended',
  ending: 'finished',
  score: 74,
  grade: 'B',
  endedAt: at(),
  events: [{ step: 'waiting', at: at() }, { step: 'robots', at: at() }, { step: 'checks', at: at() }, { step: 'ended', at: at() }],
};

test('a result from the last 7 days is shown and no scan starts, as the checker does', async (t) => {
  const stub = await publicApi({ listed: company() });
  t.after(() => stub.server.close());
  const result = await run(['https://www.Example.com/docs', '--email', 'person@example.com'], stub.api);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.outcome, 'recent');
  assert.equal(result.json.score, 71);
  assert.equal(result.json.email, 'not sent: no scan ran');
  assert.match(result.json.note, /--rescan/);
  assert.equal(result.json.reportUrl, 'https://www.agentrail.co/agent-readiness/example.com');
  // Required checks first; labelled checks never count; bonus checks are listed apart.
  assert.deepEqual(result.json.toFix.map((check) => check.check), ['Required warning', 'Recommended miss']);
  assert.deepEqual(result.json.bonusMissed, ['Bonus miss']);
  assert.equal(result.json.countedChecks.total, 4);
  assert.deepEqual(result.json.layers[1], { layer: 'payments', score: null, outOf: 10 });
  assert.deepEqual(stub.calls.map((call) => call.method), ['GET']);
  assert.equal(stub.calls[0].url, '/v1/leaderboard/companies/example.com?community=include');
});

test('starts a scan with the email, follows it to the end and reads the full result, with no credentials', async (t) => {
  let ended = false;
  const stub = await publicApi({
    listed: () => (ended ? company({ score: 74, scannedAt: at() }) : undefined),
    scans: [running, running, finished],
  });
  t.after(() => stub.server.close());
  stub.server.on('request', (request) => {
    if (request.url === `/v1/leaderboard/scans/${SCAN_ID}`) ended = true;
  });
  const result = await run(['example.com', '--email', ' person@example.com '], stub.api);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.outcome, 'finished');
  assert.equal(result.json.score, 74);
  assert.equal(result.json.joinedRunningScan, false);
  assert.equal(result.json.email, 'requested: sent once when the scan ends');
  assert.match(result.stderr, /Started a scan of example\.com/);
  assert.match(result.stderr, /Reading robots\.txt/);

  const start = stub.calls.find((call) => call.method === 'POST');
  assert.deepEqual(JSON.parse(start.body), { url: 'example.com', email: 'person@example.com' });
  assert.equal(start.headers['content-type'], 'application/json');
  for (const call of stub.calls) assert.equal(call.headers.authorization, undefined);
});

test('--rescan starts a scan even with a recent result, and sends no email field without one', async (t) => {
  const stub = await publicApi({ listed: company(), start: { status: 202, started: false }, scans: [finished] });
  t.after(() => stub.server.close());
  const result = await run(['example.com', '--rescan'], stub.api);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.outcome, 'finished');
  assert.equal(result.json.joinedRunningScan, true);
  assert.equal(result.json.email, null);
  assert.equal(stub.calls[0].method, 'POST');
  assert.deepEqual(JSON.parse(stub.calls[0].body), { url: 'example.com' });
  assert.match(result.stderr, /Joined the scan/);
});

test('a result older than 7 days starts a scan', async (t) => {
  const stub = await publicApi({
    listed: company({ scannedAt: new Date(Date.now() - 8 * 24 * HOUR_MS).toISOString() }),
    scans: [finished],
  });
  t.after(() => stub.server.close());
  const result = await run(['example.com'], stub.api);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(stub.calls.map((call) => call.method), ['GET', 'POST', 'GET', 'GET']);
});

test('a refusal comes back with the API\'s own sentence', async (t) => {
  const message = 'One visitor can start 10 scans a day, and this network address has started them all. You can start another in 3 hours.';
  const stub = await publicApi({ listed: undefined, start: { status: 429, code: 'RATE_LIMITED', message } });
  t.after(() => stub.server.close());
  const result = await run(['example.com'], stub.api);
  assert.equal(result.code, 1);
  assert.deepEqual(result.json, { outcome: 'refused', status: 429, code: 'RATE_LIMITED', message });
});

test('hands back a running scan, then follows it with --scan-id until it ends without a score', async (t) => {
  const stub = await publicApi({
    listed: undefined,
    scans: [running, { state: 'ended', ending: 'failed', cause: 'The site did not answer.', endedAt: at() }],
  });
  t.after(() => stub.server.close());
  const first = await run(['example.com', '--wait', '0'], stub.api);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.json.outcome, 'running');
  assert.equal(first.json.scanId, SCAN_ID);
  assert.equal(first.json.watchUrl, `https://www.agentrail.co/agent-readiness/example.com?scan=${SCAN_ID}`);
  assert.match(first.json.next, new RegExp(`--scan-id ${SCAN_ID}$`));

  const second = await run(['--scan-id', SCAN_ID], stub.api);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.json.outcome, 'failed');
  assert.equal(second.json.cause, 'The site did not answer.');
});

test('refuses a wrong address or email before calling the API', async (t) => {
  const stub = await publicApi({ listed: undefined });
  t.after(() => stub.server.close());
  for (const args of [[], ['two words'], ['example.com', '--email', 'nope'], ['--scan-id', 'nope'], ['example.com', '--wait', '-1']]) {
    const result = await run(args, stub.api);
    assert.equal(result.code, 2, `${args.join(' ')}: ${result.stderr}`);
  }
  assert.equal(stub.calls.length, 0);
});

test('says the API is unavailable when it cannot be reached', async () => {
  const result = await run(['example.com'], 'http://127.0.0.1:9');
  assert.equal(result.code, 1);
  assert.equal(result.json.outcome, 'unavailable');
});
