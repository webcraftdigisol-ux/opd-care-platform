import { apiClient } from './client';
import type { Appointment, BookAppointmentRequest, DoctorProfile } from '@opd/shared';

export async function listDoctors(): Promise<DoctorProfile[]> {
  const res = await apiClient.get<DoctorProfile[]>('/doctors');
  return res.data;
}

export async function bookAppointment(data: BookAppointmentRequest): Promise<Appointment> {
  const res = await apiClient.post<Appointment>('/appointments', data);
  return res.data;
}

export async function listMyAppointments(): Promise<Appointment[]> {
  const res = await apiClient.get<Appointment[]>('/appointments/mine');
  return res.data;
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>(`/appointments/${id}/cancel`);
  return res.data;
}
