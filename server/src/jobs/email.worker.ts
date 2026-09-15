import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from '../services/email.service.js';

type OutboxRow = {
  id: string;
  user_id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  created_at: Date;
};

type EmailTemplate = {
  subject: string;
  html: string;
};

let intervalId: NodeJS.Timeout | null = null;
const MAX_ATTEMPTS = 5;

export type OutboxBatchResult = {
  claimed: number;
  sent: number;
  deferred: number;
  failedAttempts: number;
};

function payloadValue(payload: Prisma.JsonValue, key: string): string {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return '';

  const value = payload[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function generateEmailTemplate(type: string, name: string, payload: Prisma.JsonValue): EmailTemplate {
  const listingTitle = payloadValue(payload, 'listingTitle') || 'your listing';

  if (type === 'HIGH_MATCH_INTEREST') {
    const tenantName = payloadValue(payload, 'tenantName') || 'A prospective tenant';
    const score = payloadValue(payload, 'score') || '—';
    const explanation = payloadValue(payload, 'explanation') || 'No matching summary is available.';

    return {
      subject: `High Match Interest on your listing: ${listingTitle}`,
      html: `
        <p>Hi ${name},</p>
        <p>A high-compatibility tenant, <strong>${tenantName}</strong>, has expressed interest in your listing: <strong>"${listingTitle}"</strong>.</p>
        <ul>
          <li><strong>Compatibility Score:</strong> ${score}/100</li>
          <li><strong>AI Matching Summary:</strong> ${explanation}</li>
        </ul>
        <p>Log in to your dashboard to review their details and accept or decline their request.</p>
        <br/>
        <p>Best regards,<br/>The RoomFinder Team</p>
      `,
    };
  }

  if (type === 'INTEREST_ACCEPTED') {
    return {
      subject: `Interest Accepted: ${listingTitle}`,
      html: `
        <p>Hi ${name},</p>
        <p>Great news! The owner of <strong>"${listingTitle}"</strong> has accepted your expressed interest.</p>
        <p>A chat conversation has been automatically created. You can now message them directly from the <strong>Inbox</strong> page of your dashboard.</p>
        <br/>
        <p>Best regards,<br/>The RoomFinder Team</p>
      `,
    };
  }

  if (type === 'INTEREST_DECLINED') {
    return {
      subject: `Update on your interest: ${listingTitle}`,
      html: `
        <p>Hi ${name},</p>
        <p>Thank you for expressing interest in <strong>"${listingTitle}"</strong>.</p>
        <p>Unfortunately, the owner has declined your interest at this time. Keep searching the dashboard for other listings that match your criteria!</p>
        <br/>
        <p>Best regards,<br/>The RoomFinder Team</p>
      `,
    };
  }

  return {
    subject: 'RoomFinder Alert Notification',
    html: `<p>Hi ${name},</p><p>You have a new update pending in your RoomFinder dashboard.</p>`,
  };
}

export async function processOutboxBatch(): Promise<OutboxBatchResult> {
  const emptyResult: OutboxBatchResult = { claimed: 0, sent: 0, deferred: 0, failedAttempts: 0 };
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<OutboxRow[]>(`
        SELECT id, user_id, type, payload, attempts, created_at
        FROM notifications_outbox
        WHERE status = 'PENDING' AND attempts < ${MAX_ATTEMPTS}
        ORDER BY created_at ASC
        LIMIT ${env.OUTBOX_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `);

      const now = Date.now();
      const result: OutboxBatchResult = {
        claimed: rows.length,
        sent: 0,
        deferred: 0,
        failedAttempts: 0,
      };

      for (const row of rows) {
        if (row.attempts > 0) {
          const delayMs = env.OUTBOX_RETRY_BASE_MS * 2 ** (row.attempts - 1);
          const ageMs = now - new Date(row.created_at).getTime();
          if (ageMs < delayMs) {
            result.deferred++;
            continue;
          }
        }

        const recipient = await tx.user.findUnique({
          where: { id: row.user_id },
          select: { email: true, name: true },
        });

        if (!recipient) {
          await tx.notificationOutbox.update({
            where: { id: row.id },
            data: {
              status: 'FAILED',
              lastError: 'Recipient user record not found',
            },
          });
          result.failedAttempts++;
          continue;
        }

        const { subject, html } = generateEmailTemplate(row.type, recipient.name, row.payload);

        try {
          await sendEmail({ toEmail: recipient.email, subject, htmlBody: html });
          await tx.notificationOutbox.update({
            where: { id: row.id },
            data: { status: 'SENT', sentAt: new Date() },
          });
          result.sent++;
        } catch (error) {
          const nextAttempts = row.attempts + 1;
          const message = error instanceof Error ? error.message : 'Error occurred during email transfer';

          await tx.notificationOutbox.update({
            where: { id: row.id },
            data: {
              attempts: nextAttempts,
              lastError: message,
              status: nextAttempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            },
          });

          logger.warn(
            { notificationId: row.id, attempts: nextAttempts, error: message },
            'Failed to dispatch outbox email — scheduled for backoff retry'
          );
          result.failedAttempts++;
        }
      }

      return result;
    });
  } catch (error) {
    logger.error({ error }, 'Error occurred inside email outbox processing loop');
    return emptyResult;
  }
}

export function startEmailWorker(): { close: () => Promise<void> } {
  if (intervalId) return { close: async () => {} };

  void processOutboxBatch();
  intervalId = setInterval(() => {
    void processOutboxBatch();
  }, env.OUTBOX_POLL_INTERVAL_MS);

  logger.info('📧 Email Outbox Worker started');

  return {
    close: async () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('📧 Email Outbox Worker stopped');
      }
    },
  };
}
