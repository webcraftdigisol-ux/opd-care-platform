import { apiClient } from './client';
import type { ClinicSummary, RegisterClinicRequest, AuthResponse, Subscription } from '@opd/shared';

export async function registerClinic(data: RegisterClinicRequest): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/clinics/register', data);
  return res.data;
}

export async function fetchClinicBySlug(slug: string): Promise<ClinicSummary> {
  const res = await apiClient.get<ClinicSummary>(`/clinics/${slug}`);
  return res.data;
}

export async function fetchCurrentClinic(): Promise<ClinicSummary> {
  const res = await apiClient.get<ClinicSummary>('/clinics/me/current');
  return res.data;
}

// Self-service read for a clinic ADMIN's own billing status -- distinct
// from the platform-admin-only /api/platform/clinics view, which can see
// every clinic's.
export async function fetchMySubscription(): Promise<Subscription> {
  const res = await apiClient.get<Subscription>('/clinics/me/subscription');
  return res.data;
}
