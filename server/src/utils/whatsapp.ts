import { prisma } from '../prisma';
import type { NotificationType } from '@opd/shared';

// ---- Provider-agnostic client ----
//
// WhatsApp Business messaging requires pre-approved message templates for
// any business-initiated send (a reminder, a prescription, a diet plan, a
// password-reset code -- none of these happen inside a 24-hour
// customer-service window a patient opened), so the interface is shaped
// around "send a named template with positional params", not arbitrary free
// text. The templates themselves (names, wording, placeholder order) are
// listed in docs/whatsapp-templates.md, which is what gets submitted to Meta
// for approval. Swapping providers means writing one new class against this
// same interface, not touching any call site.

export interface WhatsAppSendResult {
  providerMessageId: string;
}

export interface WhatsAppSendOptions {
  to: string; // E.164 phone number, e.g. +919876543210
  templateName: string; // must match a template already approved with the provider
  params: string[]; // positional {{1}}, {{2}}, ... placeholder values, in order
  // Set only for an authentication (one-time code) template: Meta requires
  // the code a second time, as the parameter of the template's copy-code
  // button. Also marks the send as sensitive, so the code is never logged.
  otpCode?: string;
}

export interface WhatsAppClient {
  sendTemplatedMessage(opts: WhatsAppSendOptions): Promise<WhatsAppSendResult>;
}

// No real credentials configured (the default in dev and tests) -- logs what
// would have been sent and returns a fake id, the same "no-op that still
// logs the attempt" shape getTransporter() uses for email when SMTP isn't
// configured. A one-time code is redacted even here: this stub also runs in
// any deployment that hasn't configured a provider yet, and a reset code in
// the server logs would let anyone with log access take over the account.
class StubWhatsAppClient implements WhatsAppClient {
  async sendTemplatedMessage(opts: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    const params = opts.otpCode ? '[redacted one-time code]' : opts.params;
    console.log(`[whatsapp:stub] would send template "${opts.templateName}" to ${opts.to} with params`, params);
    return { providerMessageId: `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

// Meta's WhatsApp Cloud API, called directly (no BSP in between -- the
// cheapest per-message option in India). Needs a WhatsApp Business account
// with a registered phone number, a permanent access token, and each
// template approved under the same name as templateName.
export class MetaCloudWhatsAppClient implements WhatsAppClient {
  constructor(
    private accessToken: string,
    private phoneNumberId: string,
    private languageCode: string,
    private graphApiVersion: string,
  ) {}

  buildRequestBody(opts: WhatsAppSendOptions) {
    return {
      messaging_product: 'whatsapp',
      to: opts.to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: opts.templateName,
        language: { code: this.languageCode },
        components: [
          { type: 'body', parameters: opts.params.map((text) => ({ type: 'text', text })) },
          ...(opts.otpCode
            ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: opts.otpCode }] }]
            : []),
        ],
      },
    };
  }

  async sendTemplatedMessage(opts: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify(this.buildRequestBody(opts)),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Meta WhatsApp send failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    const id = data.messages?.[0]?.id;
    if (!id) throw new Error('Meta WhatsApp send returned no message id');
    return { providerMessageId: id };
  }
}

// Twilio's WhatsApp API, via Node's built-in fetch (no `twilio` package).
// Twilio addresses an approved template by its own ContentSid, so
// TWILIO_CONTENT_SIDS maps each templateName to one, e.g.
// {"prescription_shared":"HX..."}. A template with no mapping is sent as
// plain Body text, which only works in Twilio's sandbox or inside a 24-hour
// session window -- fine for trying things out, not for real reminders.
export class TwilioWhatsAppClient implements WhatsAppClient {
  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string,
    private contentSids: Record<string, string>,
  ) {}

  buildRequestBody(opts: WhatsAppSendOptions): URLSearchParams {
    const body = new URLSearchParams({ From: `whatsapp:${this.fromNumber}`, To: `whatsapp:${opts.to}` });
    const contentSid = this.contentSids[opts.templateName];
    if (contentSid) {
      body.set('ContentSid', contentSid);
      body.set('ContentVariables', JSON.stringify(Object.fromEntries(opts.params.map((p, i) => [String(i + 1), p]))));
    } else {
      body.set('Body', `[${opts.templateName}] ${opts.params.join(' | ')}`);
    }
    return body;
  }

  async sendTemplatedMessage(opts: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
      },
      body: this.buildRequestBody(opts),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio WhatsApp send failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { sid: string };
    return { providerMessageId: data.sid };
  }
}

function parseContentSids(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    console.error('TWILIO_CONTENT_SIDS is not valid JSON -- ignoring it');
    return {};
  }
}

let client: WhatsAppClient | undefined;

// WHATSAPP_PROVIDER picks explicitly ("meta" or "twilio"); unset, whichever
// provider has credentials configured wins (Meta first), else the stub.
function getWhatsAppClient(): WhatsAppClient {
  if (client) return client;
  const env = process.env;
  const metaReady = !!(env.META_WHATSAPP_TOKEN && env.META_WHATSAPP_PHONE_NUMBER_ID);
  const twilioReady = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM);
  const provider = env.WHATSAPP_PROVIDER ?? (metaReady ? 'meta' : twilioReady ? 'twilio' : 'stub');

  if (provider === 'meta' && metaReady) {
    client = new MetaCloudWhatsAppClient(
      env.META_WHATSAPP_TOKEN!,
      env.META_WHATSAPP_PHONE_NUMBER_ID!,
      env.META_WHATSAPP_TEMPLATE_LANG || 'en',
      env.META_GRAPH_API_VERSION || 'v23.0',
    );
  } else if (provider === 'twilio' && twilioReady) {
    client = new TwilioWhatsAppClient(
      env.TWILIO_ACCOUNT_SID!,
      env.TWILIO_AUTH_TOKEN!,
      env.TWILIO_WHATSAPP_FROM!,
      parseContentSids(env.TWILIO_CONTENT_SIDS),
    );
  } else {
    if (provider !== 'stub') console.error(`WHATSAPP_PROVIDER=${provider} but its credentials are missing -- using the stub`);
    client = new StubWhatsAppClient();
  }
  return client;
}

// Whether a WhatsApp message would actually reach someone. False when the
// app fell back to the stub because no provider is configured (the state of
// a fresh deployment) -- then features that only make sense if the message
// arrives, like a password-reset code, are switched off rather than
// pretending to send. Dev and tests opt into the stub explicitly with
// WHATSAPP_PROVIDER=stub, which counts as available.
export function isWhatsAppDeliveryAvailable(): boolean {
  return !(getWhatsAppClient() instanceof StubWhatsAppClient) || process.env.WHATSAPP_PROVIDER === 'stub';
}

// Reset the memoized client -- used by tests that toggle WhatsApp env vars
// between cases, same purpose as resetNotifyTransporterForTests().
export function resetWhatsAppClientForTests() {
  client = undefined;
}

// ---- Formatting ----

// Phones are stored as typed at registration ("98765 43210",
// "+91-98765-43210", "09876543210"). WhatsApp needs E.164. A bare 10-digit
// number is taken as Indian (+91), the one market this platform serves.
// Returns null for anything that can't be a real number, so the caller logs
// a clear SKIPPED instead of a provider error.
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  let e164: string;
  if (hasPlus) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+91${digits}`;
  else if (digits.length === 11 && digits.startsWith('0')) e164 = `+91${digits.slice(1)}`;
  else if (digits.length === 12 && digits.startsWith('91')) e164 = `+${digits}`;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

// Meta rejects a template parameter that is empty, contains a newline or
// tab, or has more than four consecutive spaces -- so a multi-line
// prescription list would fail every send. Also caps length well under the
// body limit.
const MAX_PARAM_LENGTH = 900;
export function sanitizeTemplateParam(value: string): string {
  const flat = value
    .replace(/\s*[\r\n\t]+\s*/g, ' | ')
    .replace(/ {4,}/g, ' ')
    .trim();
  if (!flat) return '-';
  return flat.length > MAX_PARAM_LENGTH ? `${flat.slice(0, MAX_PARAM_LENGTH - 1)}…` : flat;
}

// ---- Notification-log-writing wrappers ----

interface WhatsAppNotifyOptions {
  clinicId: string;
  patientId: string | null;
  type: NotificationType;
  to: string | null | undefined;
  optedIn: boolean;
  templateName: string;
  // The template's own placeholders, from {{2}} on -- {{1}} is always the
  // clinic's name, prepended here (see below).
  params: string[];
  // A human-readable rendering of templateName+params, stored in
  // Notification.body so the audit trail / any admin view of past
  // notifications reads naturally rather than showing raw template params.
  renderedBody: string;
}

function skipped(opts: WhatsAppNotifyOptions, recipient: string, error: string) {
  return prisma.notification.create({
    data: {
      clinicId: opts.clinicId,
      patientId: opts.patientId,
      channel: 'WHATSAPP',
      type: opts.type,
      recipient,
      body: opts.renderedBody,
      status: 'SKIPPED',
      error,
    },
  });
}

// Same discipline as notifyPatientEmail: never throws, always writes a
// Notification row, whether or not a message actually went out. Consent
// (optedIn) is checked here rather than left to each call site, so no caller
// can accidentally send to a patient who hasn't agreed to receive WhatsApp
// messages -- Meta policy requires that consent, not just courtesy.
//
// Every clinic sends from one shared platform number, so each template's
// first placeholder is the clinic's name -- otherwise a patient who visits
// two clinics couldn't tell which one a message is from.
export async function notifyPatientWhatsApp(opts: WhatsAppNotifyOptions) {
  if (!opts.optedIn) return skipped(opts, opts.to ?? '(none)', 'Patient has not opted in to WhatsApp messages');
  if (!opts.to) return skipped(opts, '(none)', 'No phone number on file');
  const to = toWhatsAppNumber(opts.to);
  if (!to) return skipped(opts, opts.to, 'Phone number is not a valid WhatsApp number');

  const clinic = await prisma.clinic.findUnique({ where: { id: opts.clinicId }, select: { name: true } });
  const params = [clinic?.name ?? 'Your clinic', ...opts.params].map(sanitizeTemplateParam);

  try {
    const result = await getWhatsAppClient().sendTemplatedMessage({ to, templateName: opts.templateName, params });
    return prisma.notification.create({
      data: {
        clinicId: opts.clinicId,
        patientId: opts.patientId,
        channel: 'WHATSAPP',
        type: opts.type,
        recipient: to,
        body: opts.renderedBody,
        status: 'SENT',
        providerMessageId: result.providerMessageId,
      },
    });
  } catch (err: any) {
    return prisma.notification.create({
      data: {
        clinicId: opts.clinicId,
        patientId: opts.patientId,
        channel: 'WHATSAPP',
        type: opts.type,
        recipient: to,
        body: opts.renderedBody,
        status: 'FAILED',
        error: String(err?.message ?? err),
      },
    });
  }
}

// A password-reset code. Unlike notifyPatientWhatsApp there's no opt-in
// check: the user asked for this code themselves, which is exactly what
// Meta's authentication-template category is for. The code is never written
// to the Notification row -- only that one was sent.
export async function sendWhatsAppOtp(opts: { clinicId: string; userId: string; to: string | null; code: string }) {
  const base = {
    clinicId: opts.clinicId,
    patientId: opts.userId,
    channel: 'WHATSAPP' as const,
    type: 'PASSWORD_RESET_OTP' as const,
    body: 'Password reset code sent (the code itself is not stored)',
  };
  const to = toWhatsAppNumber(opts.to);
  if (!to) {
    return prisma.notification.create({
      data: { ...base, recipient: opts.to ?? '(none)', status: 'SKIPPED', error: 'No valid WhatsApp number on file' },
    });
  }
  try {
    const result = await getWhatsAppClient().sendTemplatedMessage({
      to,
      templateName: 'password_reset_otp',
      params: [opts.code],
      otpCode: opts.code,
    });
    return prisma.notification.create({
      data: { ...base, recipient: to, status: 'SENT', providerMessageId: result.providerMessageId },
    });
  } catch (err: any) {
    return prisma.notification.create({
      data: { ...base, recipient: to, status: 'FAILED', error: String(err?.message ?? err) },
    });
  }
}
