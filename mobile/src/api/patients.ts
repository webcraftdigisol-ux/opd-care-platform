import { apiClient } from './client';
import type { Appointment, PublicUser } from '@opd/shared';

export async function getPatientRecords(
  id: string,
): Promise<{ patient: PublicUser; appointments: Appointment[] }> {
  const res = await apiClient.get(`/patients/${id}/records`);
  return res.data;
}
