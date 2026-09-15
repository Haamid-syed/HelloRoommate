#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
set -a
source benchmarks/.env.benchmark
set +a

RESULT_FILE="benchmarks/results/outbox-$(date -u +%Y%m%dT%H%M%SZ).log"
mkdir -p benchmarks/results

{
  echo "LOCAL OUTBOX BENCHMARK — separate process invocations simulate worker restarts"
  npm run benchmark:outbox -- reset 60
  npm run benchmark:outbox -- process
  npm run benchmark:outbox -- process
  npm run benchmark:outbox -- state

  npm run benchmark:outbox -- reset 20
  docker compose -f docker-compose.benchmark.yml stop mailpit
  npm run benchmark:outbox -- process
  npm run benchmark:outbox -- state
  docker compose -f docker-compose.benchmark.yml start mailpit
  sleep 2
  npm run benchmark:outbox -- process
  npm run benchmark:outbox -- state
} 2>&1 | tee "$RESULT_FILE"

echo "Saved raw outbox results to $RESULT_FILE"
