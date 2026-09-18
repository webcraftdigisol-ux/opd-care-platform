import { apiClient } from './client';
import type { DailyActivityReport, FinancialReport, FollowUpsReport } from '@opd/shared';

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
