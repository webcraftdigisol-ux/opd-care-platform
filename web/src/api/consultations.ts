import { apiClient } from './client';
import type { Consultation, SaveConsultationRequest } from '@opd/shared';

export async function saveConsultation(
  appointmentId: string,
  data: SaveConsultationRequest & { complete?: boolean },
): Promise<Consultation> {
  const res = await apiClient.put<Consultation>(`/consultations/${appointmentId}`, data);
  return res.data;
}

export async function getConsultation(appointmentId: string): Promise<Consultation | null> {
  try {
    const res = await apiClient.get<Consultation>(`/consultations/${appointmentId}`);
    return res.data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}
