# HelloRoommate local benchmark harness

This harness targets only the isolated services in `docker-compose.benchmark.yml`:

- PostgreSQL 16: `127.0.0.1:55432/roomfinder_benchmark`
- Redis 7: `127.0.0.1:56379`
- Mailpit SMTP/API: `127.0.0.1:58025` / `127.0.0.1:58080`
- backend: `127.0.0.1:5501`

Both destructive fixture scripts reject any `DATABASE_URL` that does not contain the
isolated host, port, and database name above. No hosted database or live email/LLM
provider is used.

## Full setup

```bash
./benchmarks/run-local.sh
```

After it finishes, start the compiled backend in another terminal:

```bash
set -a
source benchmarks/.env.benchmark
set +a
npm run start -w server
```

Then run the endpoint and PostgreSQL benchmarks:

```bash
set -a
source benchmarks/.env.benchmark
set +a
npm run benchmark:http
npm run benchmark:db
```

Stop the backend before testing worker restarts, then run:

```bash
./benchmarks/run-outbox-recovery.sh
```

Raw outputs are written under `benchmarks/results/`. The HTTP runner performs a
three-second warm-up and three ten-second measured runs for each scenario by default.
Override these without changing source:

```bash
BENCH_CONCURRENCY=50 BENCH_WARMUP_SECONDS=5 BENCH_DURATION_SECONDS=20 npm run benchmark:http
BENCH_LISTINGS=20000 BENCH_MESSAGES=200000 npm run benchmark:seed
```

## Benchmark-only settings

Authentication, JWT verification, RBAC, validation, Redis rate-limiter execution,
and conversation membership checks remain enabled. The local environment changes only:

- `API_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX` are raised to avoid measuring intentional 429 responses.
- `LOG_LEVEL=warn` avoids terminal I/O becoming the bottleneck.
- outbox polling/retry/batch settings are reduced to `250 ms` / `500 ms` / `50` for recovery tests.
- `OPENROUTER_API_KEY` is blank; LLM unit tests mock `fetch`, and runtime explanations use fallback behavior.
- `EMAIL_PROVIDER=smtp` routes all mail into local Mailpit.

Normal defaults remain 300 API requests/minute, 30 auth requests/minute, a ten-second
outbox poll, a 60-second retry base, and ten notifications per batch.

See `REPORT.md` for results and interpretation.
