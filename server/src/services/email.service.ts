import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

interface SendMailParams {
  toEmail: string;
  subject: string;
  htmlBody: string;
}

// Lazily create the Gmail transporter once
let gmailTransporter: nodemailer.Transporter | null = null;

function getGmailTransporter(): nodemailer.Transporter {
  if (!gmailTransporter) {
    if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
      throw new Error('Gmail credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
    }
    gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: env.GMAIL_USER,
        pass: env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return gmailTransporter;
}

/** Deliver email through Gmail SMTP, Resend, or log it during local development. */
export async function sendEmail({ toEmail, subject, htmlBody }: SendMailParams): Promise<void> {
  // ── Gmail SMTP ──────────────────────────────────────────────────────────────
  if (env.EMAIL_PROVIDER === 'gmail') {
    const transporter = getGmailTransporter();
    await transporter.sendMail({
      from: `RoomFinder <${env.GMAIL_USER}>`,
      to: toEmail,
      subject,
      html: htmlBody,
    });
    logger.debug({ toEmail, subject }, 'Email sent successfully via Gmail SMTP');
    return;
  }

  // ── Resend ──────────────────────────────────────────────────────────────────
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

  // ── Console (default / fallback) ────────────────────────────────────────────
  logger.info(
    {
      toEmail,
      subject,
      bodyPreview: `${htmlBody.replace(/<[^>]*>/g, '').slice(0, 150)}...`,
    },
    '📧 [Console Email Service] Mock email dispatched'
  );
}
