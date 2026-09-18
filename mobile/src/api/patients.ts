import { apiClient } from './client';
import type { PatientRecordsResponse } from '@opd/shared';

export async function getPatientRecords(id: string): Promise<PatientRecordsResponse> {
  const res = await apiClient.get<PatientRecordsResponse>(`/patients/${id}/records`);
  return res.data;
}
