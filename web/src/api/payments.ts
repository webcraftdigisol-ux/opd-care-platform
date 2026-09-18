import { apiClient } from './client';
import type { BillPaymentsResponse, BillType, RecordPaymentRequest } from '@opd/shared';

export async function getBillPayments(billType: BillType, billId: string): Promise<BillPaymentsResponse> {
  const res = await apiClient.get<BillPaymentsResponse>('/payments', { params: { billType, billId } });
  return res.data;
}

export async function recordPayment(data: RecordPaymentRequest): Promise<BillPaymentsResponse> {
  const res = await apiClient.post<BillPaymentsResponse>('/payments', data);
  return res.data;
}
