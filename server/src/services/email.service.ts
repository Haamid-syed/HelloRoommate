import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

interface SendMailParams {
  toEmail: string;
  subject: string;
  htmlBody: string;
}

/** Deliver email through Resend when configured, or log it during local development. */
export async function sendEmail({ toEmail, subject, htmlBody }: SendMailParams): Promise<void> {
  if (env.EMAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY || env.RESEND_API_KEY === 'your-resend-api-key') {
      throw new Error('Resend API key is not configured');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [toEmail],
        subject,
        html: htmlBody,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown Resend API error');
      throw new Error(`Resend API failed: ${response.status} — ${errorText}`);
    }

    logger.debug({ toEmail, subject }, 'Email sent successfully via Resend');
    return;
  }

  logger.info(
    {
      toEmail,
      subject,
      bodyPreview: `${htmlBody.replace(/<[^>]*>/g, '').slice(0, 150)}...`,
    },
    '📧 [Console Email Service] Mock email dispatched'
  );
}
