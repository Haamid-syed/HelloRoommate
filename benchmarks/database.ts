import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const prisma = new PrismaClient();
const TENANT_PROFILE_ID = '20000000-0000-4000-8000-000000000001';
const CONVERSATION_ID = '40000000-0000-4000-8000-000000000001';
const DEEP_MESSAGE_ID = '50000000-0000-4000-8000-00000000c350';

const queries = {
  listingScore: `SELECT l.id, cs.score
    FROM compatibility_scores cs
    JOIN listings l ON l.id = cs.listing_id
    WHERE cs.tenant_profile_id = '${TENANT_PROFILE_ID}'
      AND l.status = 'ACTIVE' AND lower(l.city) = lower('Mumbai')
    ORDER BY cs.score DESC, cs.listing_id ASC LIMIT 51`,
  messagesFirstPage: `SELECT * FROM messages
    WHERE conversation_id = '${CONVERSATION_ID}'
    ORDER BY created_at DESC, id DESC LIMIT 51`,
  messagesDeepKeyset: `SELECT * FROM messages
    WHERE conversation_id = '${CONVERSATION_ID}'
      AND (created_at, id) < (
        SELECT created_at, id FROM messages
        WHERE id = '${DEEP_MESSAGE_ID}' AND conversation_id = '${CONVERSATION_ID}'
      )
    ORDER BY created_at DESC, id DESC LIMIT 51`,
  messagesDeepOffset: `SELECT * FROM messages
    WHERE conversation_id = '${CONVERSATION_ID}'
    ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET 50000`,
} as const;

async function explain(sql: string): Promise<any> {
  return prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  if (!databaseUrl.includes('127.0.0.1:55432/roomfinder_benchmark')) {
    throw new Error('Refusing to benchmark a non-isolated database');
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultDir = path.resolve('benchmarks/results', timestamp);
  mkdirSync(resultDir, { recursive: true });
  const output: Record<string, any> = {
    label: 'LOCAL DATABASE BENCHMARK — isolated PostgreSQL 16 container',
    timestamp: new Date().toISOString(),
    runs: {},
  };

  for (const [name, sql] of Object.entries(queries)) {
    await explain(sql); // warm-up
    output.runs[name] = [];
    for (let repeat = 1; repeat <= 3; repeat++) {
      const plan = await explain(sql);
      output.runs[name].push({ repeat, plan });
    }
  }
  writeFileSync(path.join(resultDir, 'database-plans.json'), JSON.stringify(output, null, 2));
  writeFileSync('benchmarks/results/latest-database.json', JSON.stringify(output, null, 2));
  process.stdout.write(`Saved raw PostgreSQL plans to ${path.join(resultDir, 'database-plans.json')}\n`);
}

main().finally(() => prisma.$disconnect()).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
