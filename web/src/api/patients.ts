import { apiClient } from './client';
import type {
  Patient,
  PatientBillingResponse,
  PatientDetailsInput,
  PatientRecordsResponse,
  PatientSearchResult,
  PublicUser,
} from '@opd/shared';

// The pharmacy/lab/radiology/IPD patient pickers.
export async function searchPatients(search?: string): Promise<PublicUser[]> {
  const res = await apiClient.get<PublicUser[]>('/patients', { params: { search } });
  return res.data;
}

// The as-you-type search (name, mobile or Patient ID).
export async function findPatients(q: string): Promise<PatientSearchResult[]> {
  const res = await apiClient.get<PatientSearchResult[]>('/patients/search', { params: { q } });
  return res.data;
}

export async function recentPatients(limit = 5): Promise<PatientSearchResult[]> {
  const res = await apiClient.get<PatientSearchResult[]>('/patients/recent', { params: { limit } });
  return res.data;
}

export async function registerPatient(data: PatientDetailsInput): Promise<Patient> {
  const res = await apiClient.post<Patient>('/patients', data);
  return res.data;
}

export async function getPatient(id: string): Promise<Patient> {
  const res = await apiClient.get<Patient>(`/patients/${id}`);
  return res.data;
}

export async function updatePatient(id: string, data: PatientDetailsInput): Promise<Patient> {
  const res = await apiClient.put<Patient>(`/patients/${id}`, data);
  return res.data;
}

export async function getPatientBilling(id: string): Promise<PatientBillingResponse> {
  const res = await apiClient.get<PatientBillingResponse>(`/patients/${id}/billing`);
  return res.data;
}

export async function getPatientRecords(id: string): Promise<PatientRecordsResponse> {
  const res = await apiClient.get<PatientRecordsResponse>(`/patients/${id}/records`);
  return res.data;
}
