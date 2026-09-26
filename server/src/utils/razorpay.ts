import crypto from 'crypto';

// ---- Order-creating client ----
//
// Unlike the WhatsApp adapter, there is no stub-that-fakes-success here.
// A WhatsApp send that silently no-ops is low-stakes (worst case: a message
// never arrives). A payment that silently no-ops but reports success would
// mean a clinic believes it was paid when no money moved -- so when no real
// Razorpay credentials are configured, getRazorpayClient() returns null and
// every route that needs it refuses cleanly (see payments.routes.ts) rather
// than fabricating a fake order id.

export interface RazorpayOrderResult {
  id: string;
  amount: number; // paise
  currency: string;
}

export interface RazorpayClient {
  createOrder(opts: { amountPaise: number; currency: string; receipt: string }): Promise<RazorpayOrderResult>;
}

// Written against Razorpay's Orders API (POST /v1/orders, HTTP Basic auth
// with key_id:key_secret, amount in the smallest currency unit i.e. paise
// for INR) -- untested against a live account in this environment, but a
// genuine implementation using Node's built-in fetch, no new dependency.
class LiveRazorpayClient implements RazorpayClient {
  constructor(
    private keyId: string,
    private keySecret: string,
  ) {}

  async createOrder(opts: { amountPaise: number; currency: string; receipt: string }): Promise<RazorpayOrderResult> {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: opts.amountPaise,
        currency: opts.currency,
        receipt: opts.receipt,
        payment_capture: 1,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Razorpay order creation failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { id: string; amount: number; currency: string };
    return { id: data.id, amount: data.amount, currency: data.currency };
  }
}

let client: RazorpayClient | null | undefined;

// null (not undefined) means "checked, and genuinely not configured" --
// distinct from undefined ("not checked yet"), so a real client, once
// configured, doesn't get shadowed by a stale null from an earlier check.
export function getRazorpayClient(): RazorpayClient | null {
  if (client !== undefined) return client;
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
  client = RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET ? new LiveRazorpayClient(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) : null;
  return client;
}

export function isRazorpayConfigured(): boolean {
  return getRazorpayClient() !== null;
}

// Patients paying their clinic bills online is off unless
// ONLINE_BILL_PAYMENTS=true: the one platform Razorpay account would
// otherwise collect clinics' money (see README, "Online Payments"). Clinic
// subscription renewals -- the platform's own revenue -- work whenever
// Razorpay is configured.
export function billPaymentsEnabled(): boolean {
  return isRazorpayConfigured() && process.env.ONLINE_BILL_PAYMENTS === 'true';
}

export function getRazorpayKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

// Reset the memoized client -- used by tests that inject a fake client (so
// order creation never makes a real network call) or toggle env vars
// between cases, same purpose as resetWhatsAppClientForTests().
export function resetRazorpayClientForTests(override: RazorpayClient | null | undefined) {
  client = override;
}

// ---- Signature verification ----
//
// Both formulas are Razorpay's own documented, stable HMAC-SHA256 schemes:
// checkout success  -> hmac(orderId + "|" + paymentId, key_secret)
// webhook delivery   -> hmac(rawRequestBody, webhook_secret)
// A length mismatch would make crypto.timingSafeEqual throw rather than
// return false, so it's guarded explicitly -- an attacker-supplied
// signature of the wrong length must fail closed, not crash the request.

function timingSafeEqualHex(expectedHex: string, givenHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const given = Buffer.from(givenHex, 'hex');
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(expected, given);
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return timingSafeEqualHex(expected, signature);
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqualHex(expected, signature);
}

export function isRazorpayWebhookConfigured(): boolean {
  return !!process.env.RAZORPAY_WEBHOOK_SECRET;
}
