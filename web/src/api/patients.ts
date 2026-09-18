import { apiClient } from './client';
import type { PatientRecordsResponse, PublicUser } from '@opd/shared';

export async function searchPatients(search?: string): Promise<PublicUser[]> {
  const res = await apiClient.get<PublicUser[]>('/patients', { params: { search } });
  return res.data;
}

export async function getPatientRecords(id: string): Promise<PatientRecordsResponse> {
  const res = await apiClient.get<PatientRecordsResponse>(`/patients/${id}/records`);
  return res.data;
}
