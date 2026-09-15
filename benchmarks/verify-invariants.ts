import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'] ?? '';
  if (!url.includes('127.0.0.1:55432/roomfinder_benchmark')) {
    throw new Error('Invariant verification requires the isolated benchmark database');
  }
  const [counts, duplicateMessages, duplicateOutbox, duplicateActiveInterests, acceptedWithoutConversation] = await Promise.all([
    Promise.all([
      prisma.listing.count(),
      prisma.compatibilityScore.count(),
      prisma.message.count(),
    ]),
    prisma.$queryRaw<Array<{ groups: bigint }>>`
      SELECT COUNT(*) AS groups FROM (
        SELECT conversation_id, client_msg_id FROM messages
        GROUP BY conversation_id, client_msg_id HAVING COUNT(*) > 1
      ) duplicates
    `,
    prisma.$queryRaw<Array<{ groups: bigint }>>`
      SELECT COUNT(*) AS groups FROM (
        SELECT dedup_key FROM notifications_outbox GROUP BY dedup_key HAVING COUNT(*) > 1
      ) duplicates
    `,
    prisma.$queryRaw<Array<{ groups: bigint }>>`
      SELECT COUNT(*) AS groups FROM (
        SELECT tenant_profile_id, listing_id FROM interests
        WHERE status IN ('PENDING', 'ACCEPTED')
        GROUP BY tenant_profile_id, listing_id HAVING COUNT(*) > 1
      ) duplicates
    `,
    prisma.interest.count({ where: { status: 'ACCEPTED', conversation: null } }),
  ]);
  const result = {
    listings: counts[0],
    compatibilityScores: counts[1],
    messages: counts[2],
    duplicateMessageKeys: Number(duplicateMessages[0]?.groups ?? 0),
    duplicateOutboxKeys: Number(duplicateOutbox[0]?.groups ?? 0),
    duplicateActiveInterests: Number(duplicateActiveInterests[0]?.groups ?? 0),
    acceptedInterestsWithoutConversation: acceptedWithoutConversation,
  };
  if (result.duplicateMessageKeys || result.duplicateOutboxKeys || result.duplicateActiveInterests || result.acceptedInterestsWithoutConversation) {
    throw new Error(`Invariant failure: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().finally(() => prisma.$disconnect()).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
