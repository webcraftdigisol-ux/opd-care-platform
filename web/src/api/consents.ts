import { apiClient } from './client';
import type { ConsentForm, ConsentFormInput, ConsentFormPrint, SignConsentRequest } from '@opd/shared';

export async function listConsents(admissionId: string): Promise<ConsentForm[]> {
  return (await apiClient.get<ConsentForm[]>('/consents', { params: { admissionId } })).data;
}

export async function createConsent(admissionId: string, data: ConsentFormInput): Promise<ConsentForm> {
  return (await apiClient.post<ConsentForm>('/consents', { ...data, admissionId })).data;
}

export async function getConsent(id: string): Promise<ConsentFormPrint> {
  return (await apiClient.get<ConsentFormPrint>(`/consents/${id}`)).data;
}

export async function signConsent(id: string, data: SignConsentRequest): Promise<ConsentForm> {
  return (await apiClient.post<ConsentForm>(`/consents/${id}/sign`, data)).data;
}

export async function deleteConsent(id: string): Promise<void> {
  await apiClient.delete(`/consents/${id}`);
}
