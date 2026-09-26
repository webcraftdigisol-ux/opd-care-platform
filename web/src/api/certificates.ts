import { apiClient } from './client';
import type { CertificateInput, CertificatePrint, MedicalCertificate } from '@opd/shared';

export async function listCertificates(patientId: string): Promise<MedicalCertificate[]> {
  return (await apiClient.get<MedicalCertificate[]>('/certificates', { params: { patientId } })).data;
}

export async function issueCertificate(patientId: string, data: CertificateInput): Promise<MedicalCertificate> {
  return (await apiClient.post<MedicalCertificate>('/certificates', { ...data, patientId })).data;
}

export async function getCertificate(id: string): Promise<CertificatePrint> {
  return (await apiClient.get<CertificatePrint>(`/certificates/${id}`)).data;
}
