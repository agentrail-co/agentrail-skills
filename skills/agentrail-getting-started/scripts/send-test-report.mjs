#!/usr/bin/env node
// Sends one test report to an Agentrail feedback project and prints the
// receipt. A test report is marked "test": true: it shows with a Test badge
// and no count includes it, but it fixes the project's address, so send it
// only once the address is final.
//
// Usage: node send-test-report.mjs <hosted page | project card | collection endpoint | address>
//
// For a project that accepts only signed reports, set AGENTRAIL_FEEDBACK_SECRET
// in the environment first. The secret is read from there, never from the
// command line, and is never printed.

import { createHmac } from 'node:crypto';

const DEFAULT_ORIGIN = 'https://feedback.agentrail.co';
const TIMEOUT_MS = 15_000;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const input = process.argv[2];
if (!input || input === '--help' || input === '-h') {
  process.stdout.write(
    'Usage: node send-test-report.mjs <hosted page | project card | collection endpoint | address>\n',
  );
  process.exit(input ? 0 : 1);
}

/** The project's origin and address, from any of its URLs or the bare address. */
function projectOf(value) {
  if (!/^https?:\/\//i.test(value)) {
    if (!/^[a-z][a-z0-9-]{2,39}$/.test(value))
      fail(`"${value}" is neither a feedback URL nor a project address.`);
    return { origin: DEFAULT_ORIGIN, slug: value };
  }
  const url = new URL(value);
  const match =
    url.pathname.match(/^\/p\/([^/.]+)/) ??
    url.pathname.match(/^\/v1\/feedback\/([^/]+)/);
  if (!match) fail(`Cannot find the project's address in ${value}.`);
  return { origin: url.origin, slug: decodeURIComponent(match[1]) };
}

async function request(url, init) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    fail(`Could not reach ${url}: ${error.cause?.code ?? error.message}`);
  }
}

const { origin, slug } = projectOf(input);
const cardUrl = `${origin}/v1/feedback/${encodeURIComponent(slug)}`;

const cardResponse = await request(cardUrl, { headers: { accept: 'application/json' } });
if (cardResponse.status === 404) fail(`No feedback project at ${cardUrl}. Check the address.`);
if (!cardResponse.ok) fail(`Reading ${cardUrl} answered ${cardResponse.status}.`);
const card = await cardResponse.json();

if (!card.accepting)
  fail(`"${card.name}" is not accepting reports (paused or suspended). An Admin resumes it first.`);

const secret = process.env.AGENTRAIL_FEEDBACK_SECRET;
if (card.signedOnly && !secret)
  fail(
    `"${card.name}" accepts only signed reports. Set AGENTRAIL_FEEDBACK_SECRET to one of its signing secrets, then run this again.`,
  );

const body = JSON.stringify({
  observation:
    'Test report sent while setting up Agentrail, to check that reports reach the inbox.',
  outcome: 'succeeded',
  category: 'other',
  surface: 'other',
  agent: 'agentrail-getting-started skill',
  test: true,
});

const headers = { 'content-type': 'application/json', accept: 'application/json' };
if (secret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  headers['feedback-timestamp'] = timestamp;
  headers['feedback-signature'] = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}

const response = await request(card.collectionUrl, { method: 'POST', headers, body });
const text = await response.text();
let answer;
try {
  answer = JSON.parse(text);
} catch {
  answer = { body: text.slice(0, 500) };
}

if (!response.ok) {
  const code = answer.error?.code ?? answer.code ?? '';
  fail(`The report was refused: ${response.status} ${code}\n${JSON.stringify(answer, null, 2)}`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      sent: true,
      project: card.name,
      address: card.slug,
      signed: Boolean(secret),
      receipt: answer,
      next: 'Read the checklist: test_report should be done.',
    },
    null,
    2,
  )}\n`,
);
