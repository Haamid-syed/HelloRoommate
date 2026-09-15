import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

type JsonObject = Record<string, any>;
type Sample = { atMs: number; cpuPercent: number; rssMb: number };

const BASE_URL = process.env['BENCH_BASE_URL'] ?? 'http://127.0.0.1:5501';
const CONCURRENCY = Number(process.env['BENCH_CONCURRENCY'] ?? 25);
const DURATION_SECONDS = Number(process.env['BENCH_DURATION_SECONDS'] ?? 10);
const WARMUP_SECONDS = Number(process.env['BENCH_WARMUP_SECONDS'] ?? 3);
const REPEATS = 3;
const CONVERSATION_ID = '40000000-0000-4000-8000-000000000001';

function indexedUuid(prefix: string, index: number): string {
  return `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

function findServerProcess(): { pid: number; rssMb: number; cpuPercent: number } | null {
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,rss=,%cpu=,command='], { encoding: 'utf8' });
    const line = rows.split('\n').find((row) => row.includes('node dist/index.js'));
    if (!line) return null;
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+/);
    if (!match) return null;
    return { pid: Number(match[1]), rssMb: Number(match[2]) / 1024, cpuPercent: Number(match[3]) };
  } catch {
    return null;
  }
}

async function jsonRequest(url: string, token: string): Promise<JsonObject> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json() as JsonObject;
  if (!response.ok || body.success !== true) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 180)}`);
  }
  return body;
}

function validateListings(body: JsonObject): void {
  const listings = body.data?.listings;
  if (!Array.isArray(listings) || listings.length === 0 || listings.length > 50) {
    throw new Error('Invalid listing result size');
  }
  for (let index = 0; index < listings.length; index++) {
    const listing = listings[index];
    if (listing.city !== 'Mumbai' || listing.status !== 'ACTIVE' || typeof listing.score?.score !== 'number') {
      throw new Error('Listing filter/score correctness failure');
    }
    if (index > 0 && listings[index - 1].score.score < listing.score.score) {
      throw new Error('Listing score ordering failure');
    }
  }
}

function validateMessages(body: JsonObject): void {
  const messages = body.data?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) {
    throw new Error('Invalid message result size');
  }
  for (let index = 1; index < messages.length; index++) {
    if (new Date(messages[index - 1].createdAt).getTime() < new Date(messages[index].createdAt).getTime()) {
      throw new Error('Message ordering failure');
    }
  }
}

async function correctnessPreflight(token: string): Promise<JsonObject> {
  const first = await jsonRequest(`${BASE_URL}/api/v1/listings?city=Mumbai&sort=score&limit=50`, token);
  validateListings(first);
  const cursor = first.meta?.cursor;
  const second = await jsonRequest(
    `${BASE_URL}/api/v1/listings?city=Mumbai&sort=score&limit=50&cursor=${encodeURIComponent(cursor)}`,
    token
  );
  validateListings(second);
  const listingIds = [...first.data.listings, ...second.data.listings].map((item: JsonObject) => item.id);
  if (new Set(listingIds).size !== listingIds.length) throw new Error('Duplicate listing across cursor pages');

  const firstMessages = await jsonRequest(
    `${BASE_URL}/api/v1/conversations/${CONVERSATION_ID}/messages?limit=50`, token
  );
  validateMessages(firstMessages);
  const secondMessages = await jsonRequest(
    `${BASE_URL}/api/v1/conversations/${CONVERSATION_ID}/messages?limit=50&cursor=${encodeURIComponent(firstMessages.meta.cursor)}`,
    token
  );
  validateMessages(secondMessages);
  const messageIds = [...firstMessages.data.messages, ...secondMessages.data.messages].map((item: JsonObject) => item.id);
  if (new Set(messageIds).size !== messageIds.length) throw new Error('Duplicate message across cursor pages');

  return {
    listingPagesVerified: 2,
    listingRowsVerified: listingIds.length,
    messagePagesVerified: 2,
    messageRowsVerified: messageIds.length,
    scoreOrderVerified: true,
    filtersVerified: true,
    cursorDuplicates: 0,
  };
}

async function runLoad(
  name: string,
  url: string,
  token: string,
  seconds: number,
  validate: (body: JsonObject) => void,
  record: boolean
): Promise<JsonObject> {
  const latenciesMs: number[] = [];
  const errors: string[] = [];
  let totalErrors = 0;
  const samples: Sample[] = [];
  const started = performance.now();
  const deadline = started + seconds * 1_000;
  const sampler = setInterval(() => {
    const current = findServerProcess();
    if (current) samples.push({ atMs: performance.now() - started, cpuPercent: current.cpuPercent, rssMb: current.rssMb });
  }, 500);

  const worker = async () => {
    while (performance.now() < deadline) {
      const requestStarted = performance.now();
      try {
        const body = await jsonRequest(url, token);
        validate(body);
      } catch (error) {
        totalErrors++;
        if (errors.length < 100) errors.push(error instanceof Error ? error.message : String(error));
      } finally {
        latenciesMs.push(performance.now() - requestStarted);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  clearInterval(sampler);
  const elapsedSeconds = (performance.now() - started) / 1_000;
  const errorCount = totalErrors;
  const result = {
    name,
    concurrency: CONCURRENCY,
    configuredSeconds: seconds,
    elapsedSeconds,
    requests: latenciesMs.length,
    throughputRps: latenciesMs.length / elapsedSeconds,
    latencyMs: {
      p50: percentile(latenciesMs, 50),
      p95: percentile(latenciesMs, 95),
      p99: percentile(latenciesMs, 99),
      min: Math.min(...latenciesMs),
      max: Math.max(...latenciesMs),
    },
    errors: errorCount,
    errorRate: errorCount / latenciesMs.length,
    process: samples.length > 0 ? {
      pid: findServerProcess()?.pid ?? null,
      avgCpuPercent: samples.reduce((sum, sample) => sum + sample.cpuPercent, 0) / samples.length,
      maxCpuPercent: Math.max(...samples.map((sample) => sample.cpuPercent)),
      avgRssMb: samples.reduce((sum, sample) => sum + sample.rssMb, 0) / samples.length,
      maxRssMb: Math.max(...samples.map((sample) => sample.rssMb)),
      samples,
    } : null,
    firstErrors: errors,
    ...(record ? { rawLatenciesMs: latenciesMs } : {}),
  };
  return result;
}

async function main(): Promise<void> {
  const health = await fetch(`${BASE_URL}/readyz`);
  if (!health.ok) throw new Error(`Backend is not ready at ${BASE_URL}`);
  const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bench-tenant@local.test', password: 'benchmark-password' }),
  });
  const loginBody = await login.json() as JsonObject;
  if (!login.ok) throw new Error(`Benchmark login failed: ${JSON.stringify(loginBody)}`);
  const token = loginBody.data.accessToken as string;
  const correctness = await correctnessPreflight(token);

  const scenarios = [
    {
      name: 'listing-search-score',
      url: `${BASE_URL}/api/v1/listings?city=Mumbai&sort=score&limit=50`,
      validate: validateListings,
    },
    {
      name: 'message-pagination-first-page',
      url: `${BASE_URL}/api/v1/conversations/${CONVERSATION_ID}/messages?limit=50`,
      validate: validateMessages,
    },
    {
      name: 'message-pagination-deep-cursor',
      url: `${BASE_URL}/api/v1/conversations/${CONVERSATION_ID}/messages?limit=50&cursor=${indexedUuid('50000000', 50_000)}`,
      validate: validateMessages,
    },
  ];

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultDir = path.resolve('benchmarks/results', timestamp);
  mkdirSync(resultDir, { recursive: true });
  const output: JsonObject = {
    label: 'LOCAL BENCHMARK — MacBook Air M1, isolated Docker services',
    timestamp: new Date().toISOString(),
    environment: {
      platform: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model,
      logicalCpus: os.cpus().length,
      totalMemoryGb: os.totalmem() / 1024 ** 3,
      node: process.version,
      baseUrl: BASE_URL,
      concurrency: CONCURRENCY,
      warmupSeconds: WARMUP_SECONDS,
      durationSeconds: DURATION_SECONDS,
      repeats: REPEATS,
    },
    dataset: { listings: 10_000, messages: 100_000 },
    correctness,
    runs: [],
  };

  for (const scenario of scenarios) {
    await runLoad(scenario.name, scenario.url, token, WARMUP_SECONDS, scenario.validate, false);
    for (let repeat = 1; repeat <= REPEATS; repeat++) {
      const result = await runLoad(scenario.name, scenario.url, token, DURATION_SECONDS, scenario.validate, true);
      result.repeat = repeat;
      output.runs.push(result);
      process.stdout.write(`${scenario.name} run ${repeat}: ${result.throughputRps.toFixed(1)} req/s, p95 ${result.latencyMs.p95.toFixed(1)} ms, errors ${result.errors}\n`);
    }
  }

  writeFileSync(path.join(resultDir, 'http-raw.json'), JSON.stringify(output, null, 2));
  writeFileSync('benchmarks/results/latest-http.json', JSON.stringify(output, null, 2));
  process.stdout.write(`Saved raw HTTP results to ${path.join(resultDir, 'http-raw.json')}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
