import { sendEmail } from '../services/email.service.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function run() {
  const to = process.argv[2] || 'jaguarv999@gmail.com';
  console.log(`Sending test email to ${to}...`);
  try {
    await sendEmail({
      toEmail: to,
      subject: 'RoomFinder Test Email',
      htmlBody: '<h1>Test Email</h1><p>If you see this, Gmail SMTP email is configured correctly!</p>',
    });
    console.log('✅ Test email finished successfully!');
  } catch (err) {
    console.error('❌ Failed to send test email:', err);
  }
}

run();
