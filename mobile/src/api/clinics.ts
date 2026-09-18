import { apiClient } from './client';
import type { ClinicSummary } from '@opd/shared';

export async function fetchCurrentClinic(): Promise<ClinicSummary> {
  const res = await apiClient.get<ClinicSummary>('/clinics/me/current');
  return res.data;
}
