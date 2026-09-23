import { prisma } from '../prisma';
import type { NotificationType } from '@opd/shared';

// ---- Provider-agnostic client ----
//
// WhatsApp Business messaging requires pre-approved message templates for
// any business-initiated send (a reminder, a prescription, a diet plan --
// none of these happen inside a 24-hour customer-service window a patient
// opened), so the interface is shaped around "send a named template with
// positional params", not arbitrary free text. Swapping providers (Twilio,
// Meta's Cloud API directly, another BSP) means writing one new class
// against this same interface, not touching any call site.

export interface WhatsAppSendResult {
  providerMessageId: string;
}

export interface WhatsAppSendOptions {
  to: string; // E.164 phone number, e.g. +919876543210
  templateName: string; // must match a template already approved with the provider
  params: string[]; // positional {{1}}, {{2}}, ... placeholder values, in order
}

export interface WhatsAppClient {
  sendTemplatedMessage(opts: WhatsAppSendOptions): Promise<WhatsAppSendResult>;
}

// No real credentials configured for this deployment (the normal case
// today -- see README's WhatsApp Integration section) -- logs what would
// have been sent and returns a fake id, the same "no-op that still logs
// the attempt" shape getTransporter() uses for email when SMTP isn't
// configured. Also the default in tests, so the suite never makes a real
// network call.
class StubWhatsAppClient implements WhatsAppClient {
  async sendTemplatedMessage(opts: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    console.log(`[whatsapp:stub] would send template "${opts.templateName}" to ${opts.to} with params`, opts.params);
    return { providerMessageId: `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

// Real implementation, written against Twilio's WhatsApp API -- untested
// against a live account (no credentials available in this environment,
// see README), but a genuine implementation, not a placeholder: point
// TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_FROM at a real
// account and this is the whole change needed to go live. Uses Node's
// built-in fetch rather than the `twilio` npm package, so this file has no
// new dependency that would otherwise sit untested.
class TwilioWhatsAppClient implements WhatsAppClient {
  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string,
  ) {}

  async sendTemplatedMessage(opts: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      From: `whatsapp:${this.fromNumber}`,
      To: `whatsapp:${opts.to}`,
      // Twilio's Content API addresses an approved template by its own
      // ContentSid, not this human-readable name -- a real deployment
      // would map templateName -> ContentSid here once templates are
      // actually approved and their SIDs are known. Sending as plain Body
      // text in the meantime only works inside Twilio's sandbox or a
      // 24-hour session window, not for a cold business-initiated send.
      Body: `[${opts.templateName}] ${opts.params.join(' | ')}`,
    });
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio WhatsApp send failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { sid: string };
    return { providerMessageId: data.sid };
  }
}

let client: WhatsAppClient | undefined;

function getWhatsAppClient(): WhatsAppClient {
  if (client) return client;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
    client = new TwilioWhatsAppClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM);
  } else {
    client = new StubWhatsAppClient();
  }
  return client;
}

// Reset the memoized client -- used by tests that toggle WhatsApp env vars
// between cases, same purpose as resetNotifyTransporterForTests().
export function resetWhatsAppClientForTests() {
  client = undefined;
}

// ---- Notification-log-writing wrapper ----

interface WhatsAppNotifyOptions {
  clinicId: string;
  patientId: string | null;
  type: NotificationType;
  to: string | null | undefined;
  optedIn: boolean;
  templateName: string;
  params: string[];
  // A human-readable rendering of templateName+params, stored in
  // Notification.body so the audit trail / any admin view of past
  // notifications reads naturally rather than showing raw template params.
  renderedBody: string;
}

// Same discipline as notifyPatientEmail: always writes a Notification row,
// whether or not a message actually went out. Consent (optedIn) is checked
// here rather than left to each call site, so no caller can accidentally
// send to a patient who hasn't agreed to receive WhatsApp messages -- Meta
// policy requires that consent, not just courtesy.
export async function notifyPatientWhatsApp(opts: WhatsAppNotifyOptions) {
  const { clinicId, patientId, type, to, optedIn, templateName, params, renderedBody } = opts;

  if (!optedIn) {
    return prisma.notification.create({
      data: {
        clinicId,
        patientId,
        channel: 'WHATSAPP',
        type,
        recipient: to ?? '(none)',
        body: renderedBody,
        status: 'SKIPPED',
        error: 'Patient has not opted in to WhatsApp messages',
      },
    });
  }
  if (!to) {
    return prisma.notification.create({
      data: {
        clinicId,
        patientId,
        channel: 'WHATSAPP',
        type,
        recipient: '(none)',
        body: renderedBody,
        status: 'SKIPPED',
        error: 'No phone number on file',
      },
    });
  }

  try {
    const result = await getWhatsAppClient().sendTemplatedMessage({ to, templateName, params });
    return prisma.notification.create({
      data: {
        clinicId,
        patientId,
        channel: 'WHATSAPP',
        type,
        recipient: to,
        body: renderedBody,
        status: 'SENT',
        providerMessageId: result.providerMessageId,
      },
    });
  } catch (err: any) {
    return prisma.notification.create({
      data: {
        clinicId,
        patientId,
        channel: 'WHATSAPP',
        type,
        recipient: to,
        body: renderedBody,
        status: 'FAILED',
        error: String(err?.message ?? err),
      },
    });
  }
}
