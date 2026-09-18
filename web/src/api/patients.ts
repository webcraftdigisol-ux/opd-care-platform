import { apiClient } from './client';
import type { Appointment, PublicUser } from '@opd/shared';

export async function searchPatients(search?: string): Promise<PublicUser[]> {
  const res = await apiClient.get<PublicUser[]>('/patients', { params: { search } });
  return res.data;
}

export async function getPatientRecords(
  id: string,
): Promise<{ patient: PublicUser; appointments: Appointment[] }> {
  const res = await apiClient.get(`/patients/${id}/records`);
  return res.data;
}
