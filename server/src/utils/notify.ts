import nodemailer, { Transporter } from 'nodemailer';
import { prisma } from '../prisma';
import type { NotificationType } from '@opd/shared';

// Lazily built once, memoized. `undefined` = not yet resolved, `null` =
// resolved and no SMTP configured (email sending is a no-op that still
// logs the attempt).
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

// Reset the memoized transporter -- used by tests that toggle SMTP env vars
// between cases.
export function resetNotifyTransporterForTests() {
  transporter = undefined;
}

interface NotifyOptions {
  clinicId: string;
  patientId: string | null;
  type: NotificationType;
  to: string | null | undefined;
  subject: string;
  body: string;
}

// Always writes a Notification row, whether or not the email actually went
// out -- SKIPPED (no SMTP configured, or no usable recipient, e.g. the
// synthetic walkin-<phone>@opd.local address) is an expected, auditable
// outcome, not swallowed silently and not treated as a failure.
export async function notifyPatientEmail(opts: NotifyOptions) {
  const { clinicId, patientId, type, to, subject, body } = opts;

  const validRecipient = to && !to.endsWith('@opd.local') ? to : null;
  if (!validRecipient) {
    return prisma.notification.create({
      data: {
        clinicId,
        patientId,
        channel: 'EMAIL',
        type,
        recipient: to ?? '(none)',
        subject,
        body,
        status: 'SKIPPED',
        error: 'No usable recipient email address',
      },
    });
  }

  const mailer = getTransporter();
  if (!mailer) {
    return prisma.notification.create({
      data: {
        clinicId,
        patientId,
        channel: 'EMAIL',
        type,
        recipient: validRecipient,
        subject,
        body,
        status: 'SKIPPED',
        error: 'SMTP not configured for this deployment',
      },
    });
  }

  try {
    await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: validRecipient, subject, text: body });
    return prisma.notification.create({
      data: { clinicId, patientId, channel: 'EMAIL', type, recipient: validRecipient, subject, body, status: 'SENT' },
    });
  } catch (err: any) {
    return prisma.notification.create({
      data: {
        clinicId,
        patientId,
        channel: 'EMAIL',
        type,
        recipient: validRecipient,
        subject,
        body,
        status: 'FAILED',
        error: String(err?.message ?? err),
      },
    });
  }
}
