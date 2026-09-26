import { apiClient } from './client';
import type { DashboardSummary } from '@opd/shared';

export async function getDashboard(date: string): Promise<DashboardSummary> {
  const res = await apiClient.get<DashboardSummary>('/dashboard', { params: { date } });
  return res.data;
}
