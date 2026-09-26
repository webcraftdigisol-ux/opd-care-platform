import { apiClient } from './client';
import type { Consultation, Notification, SaveConsultationRequest, VisitSummary } from '@opd/shared';

export async function saveConsultation(
  appointmentId: string,
  data: SaveConsultationRequest,
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

export async function getVisitSummary(appointmentId: string): Promise<VisitSummary> {
  const res = await apiClient.get<VisitSummary>(`/consultations/${appointmentId}/summary`);
  return res.data;
}

// Fetched through the authenticated client (a plain link can't carry the
// token) and opened from an object URL.
export async function downloadVisitSummaryPdf(appointmentId: string, fileName: string): Promise<void> {
  const res = await apiClient.get(`/consultations/${appointmentId}/summary.pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function sendVisitSummaryWhatsApp(appointmentId: string): Promise<Notification> {
  const res = await apiClient.post<Notification>(`/consultations/${appointmentId}/send-summary-whatsapp`);
  return res.data;
}
