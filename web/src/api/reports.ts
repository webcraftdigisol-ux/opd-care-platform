import { apiClient } from './client';
import type {
  BillType,
  DailyActivityReport,
  Department,
  FinancialReport,
  FollowUpReminderResult,
  FollowUpsReport,
  OrdersReport,
  TransactionsReport,
} from '@opd/shared';

export async function getFinancialReport(from?: string, to?: string): Promise<FinancialReport> {
  const res = await apiClient.get<FinancialReport>('/reports/financial', { params: { from, to } });
  return res.data;
}

export async function getDailyActivityReport(date?: string): Promise<DailyActivityReport> {
  const res = await apiClient.get<DailyActivityReport>('/reports/daily-activity', { params: { date } });
  return res.data;
}

export async function getFollowUpsReport(): Promise<FollowUpsReport> {
  const res = await apiClient.get<FollowUpsReport>('/reports/follow-ups');
  return res.data;
}

export async function markFollowUpContacted(consultationId: string): Promise<void> {
  await apiClient.post(`/reports/follow-ups/${consultationId}/contacted`);
}

export async function sendFollowUpReminder(consultationId: string): Promise<FollowUpReminderResult> {
  const res = await apiClient.post<FollowUpReminderResult>(`/reports/follow-ups/${consultationId}/remind`);
  return res.data;
}

export async function getTransactionsReport(q: { from: string; to: string; doctorId?: string; types: BillType[] }): Promise<TransactionsReport> {
  const res = await apiClient.get<TransactionsReport>('/reports/transactions', {
    params: { from: q.from, to: q.to, doctorId: q.doctorId, types: q.types.join(',') },
  });
  return res.data;
}

export async function getOrdersReport(q: { from: string; to: string; doctorId?: string; departments?: Department[] }): Promise<OrdersReport> {
  const res = await apiClient.get<OrdersReport>('/reports/orders', {
    params: { from: q.from, to: q.to, doctorId: q.doctorId, departments: q.departments?.join(',') },
  });
  return res.data;
}
