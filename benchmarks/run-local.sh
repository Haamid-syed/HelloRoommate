#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source benchmarks/.env.benchmark
set +a

mkdir -p benchmarks/results

docker compose -f docker-compose.benchmark.yml up -d --wait
npx prisma migrate deploy --schema server/prisma/schema.prisma
npm run build
npm test -w server
npm run benchmark:seed
npm run benchmark:verify

echo "Start the backend in another terminal with:"
echo "  set -a; source benchmarks/.env.benchmark; set +a; npm run start -w server"
echo "Then run:"
echo "  npm run benchmark:http"
echo "  npm run benchmark:db"

