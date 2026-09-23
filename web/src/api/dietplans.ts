import { apiClient } from './client';
import type { DietPlan, DietPlanInput, Notification } from '@opd/shared';

export async function listDietPlans(patientId: string): Promise<DietPlan[]> {
  const res = await apiClient.get<DietPlan[]>('/diet-plans', { params: { patientId } });
  return res.data;
}

export async function createDietPlan(data: DietPlanInput): Promise<DietPlan> {
  const res = await apiClient.post<DietPlan>('/diet-plans', data);
  return res.data;
}

export async function sendDietPlanWhatsApp(id: string): Promise<Notification> {
  const res = await apiClient.post<Notification>(`/diet-plans/${id}/send-whatsapp`);
  return res.data;
}

export async function sendPrescriptionWhatsApp(appointmentId: string): Promise<Notification> {
  const res = await apiClient.post<Notification>(`/consultations/${appointmentId}/send-prescription-whatsapp`);
  return res.data;
}
