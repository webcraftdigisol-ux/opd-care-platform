import type { RazorpayOrderResponse } from '@opd/shared';

// Razorpay's Checkout.js is only ever fetched from their CDN when a patient
// or admin actually opens the payment modal -- never bundled, and never
// loaded on a page that doesn't need it (e.g. a clinic with no order to pay
// never touches network for this at all).
let scriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection and try again.'));
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface RazorpayCheckoutResult {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface OpenRazorpayCheckoutOptions {
  order: RazorpayOrderResponse;
  clinicName: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
}

// Wraps Razorpay Checkout.js's callback-based modal in a Promise: resolves
// with the signed callback payload on success, rejects if the patient/admin
// closes the modal or the payment fails. The resolved fields are exactly
// what POST /payments/razorpay/verify expects (see VerifyRazorpayPaymentRequest).
export async function openRazorpayCheckout(options: OpenRazorpayCheckoutOptions): Promise<RazorpayCheckoutResult> {
  await loadCheckoutScript();

  return new Promise((resolve, reject) => {
    const razorpay = new (window as any).Razorpay({
      key: options.order.keyId,
      amount: options.order.amount,
      currency: options.order.currency,
      order_id: options.order.orderId,
      name: options.clinicName,
      description: options.description,
      prefill: options.prefill,
      handler: (response: any) => {
        resolve({
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => reject(new Error('Payment was cancelled')),
      },
    });
    razorpay.on('payment.failed', (response: any) => {
      reject(new Error(response.error?.description || 'Payment failed'));
    });
    razorpay.open();
  });
}
