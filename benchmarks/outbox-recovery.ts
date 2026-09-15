import { PrismaClient } from '@prisma/client';
import { processOutboxBatch } from '../server/src/jobs/email.worker.js';

const prisma = new PrismaClient();
const USER_ID = '00000000-0000-4000-8000-000000000002';
const MAILPIT_API = process.env['MAILPIT_API'] ?? 'http://127.0.0.1:58080';

async function reset(count: number): Promise<void> {
  await prisma.notificationOutbox.deleteMany({ where: { dedupKey: { startsWith: 'benchmark-outbox-' } } });
  try {
    await fetch(`${MAILPIT_API}/api/v1/messages`, { method: 'DELETE' });
  } catch {
    // Reset may intentionally be invoked while the provider is unavailable.
  }
  await prisma.notificationOutbox.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      userId: USER_ID,
      type: 'INTEREST_ACCEPTED',
      dedupKey: `benchmark-outbox-${index.toString().padStart(5, '0')}`,
      payload: { listingTitle: `Benchmark listing ${index.toString().padStart(5, '0')}` },
    })),
  });
  process.stdout.write(`${JSON.stringify({ phase: 'reset', inserted: count })}\n`);
}

async function state(): Promise<void> {
  const grouped = await prisma.notificationOutbox.groupBy({
    by: ['status'],
    where: { dedupKey: { startsWith: 'benchmark-outbox-' } },
    _count: true,
  });
  let mailpit: Record<string, unknown> = { reachable: false };
  try {
    const response = await fetch(`${MAILPIT_API}/api/v1/messages?limit=1000`);
    const body = await response.json() as { total?: number; messages?: Array<{ Subject?: string }> };
    const subjects = (body.messages ?? []).map((message) => message.Subject).filter(Boolean);
    mailpit = {
      reachable: response.ok,
      total: body.total ?? subjects.length,
      uniqueSubjects: new Set(subjects).size,
      duplicateSubjects: subjects.length - new Set(subjects).size,
    };
  } catch (error) {
    mailpit = { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
  process.stdout.write(`${JSON.stringify({ phase: 'state', database: grouped, mailpit }, null, 2)}\n`);
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'] ?? '';
  if (!url.includes('127.0.0.1:55432/roomfinder_benchmark')) {
    throw new Error('Outbox verification requires the isolated benchmark database');
  }
  const command = process.argv[2] ?? 'state';
  if (command === 'reset') {
    await reset(Number(process.argv[3] ?? 60));
  } else if (command === 'process') {
    const result = await processOutboxBatch();
    process.stdout.write(`${JSON.stringify({ phase: 'process', result }, null, 2)}\n`);
  } else if (command === 'state') {
    await state();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

main().finally(() => prisma.$disconnect()).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
