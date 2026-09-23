import { apiClient } from './client';
import type {
  BillPaymentsResponse,
  BillType,
  RazorpayConfigStatus,
  RazorpayOrderResponse,
  RecordPaymentRequest,
  VerifyBillPaymentResponse,
  VerifyRazorpayPaymentRequest,
  VerifySubscriptionPaymentResponse,
} from '@opd/shared';

export async function getBillPayments(billType: BillType, billId: string): Promise<BillPaymentsResponse> {
  const res = await apiClient.get<BillPaymentsResponse>('/payments', { params: { billType, billId } });
  return res.data;
}

export async function recordPayment(data: RecordPaymentRequest): Promise<BillPaymentsResponse> {
  const res = await apiClient.post<BillPaymentsResponse>('/payments', data);
  return res.data;
}

// ---- Online payments (Razorpay) ----

export async function getRazorpayStatus(): Promise<RazorpayConfigStatus> {
  const res = await apiClient.get<RazorpayConfigStatus>('/payments/razorpay/status');
  return res.data;
}

export async function createBillPaymentOrder(billType: BillType, billId: string): Promise<RazorpayOrderResponse> {
  const res = await apiClient.post<RazorpayOrderResponse>('/payments/razorpay/orders', { billType, billId });
  return res.data;
}

export async function createSubscriptionPaymentOrder(): Promise<RazorpayOrderResponse> {
  const res = await apiClient.post<RazorpayOrderResponse>('/payments/razorpay/subscription-orders', {});
  return res.data;
}

// Two thin wrappers over the same endpoint, typed for the two shapes it can
// return -- the caller always knows which kind of order it just created, so
// there's no ambiguity to resolve at runtime.
export async function verifyBillPayment(data: VerifyRazorpayPaymentRequest): Promise<VerifyBillPaymentResponse> {
  const res = await apiClient.post<VerifyBillPaymentResponse>('/payments/razorpay/verify', data);
  return res.data;
}

export async function verifySubscriptionPayment(data: VerifyRazorpayPaymentRequest): Promise<VerifySubscriptionPaymentResponse> {
  const res = await apiClient.post<VerifySubscriptionPaymentResponse>('/payments/razorpay/verify', data);
  return res.data;
}
