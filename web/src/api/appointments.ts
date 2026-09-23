import { apiClient } from './client';
import type {
  Appointment,
  AppointmentStatus,
  BookAppointmentRequest,
  WalkInRequest,
} from '@opd/shared';

export async function bookAppointment(data: BookAppointmentRequest): Promise<Appointment> {
  const res = await apiClient.post<Appointment>('/appointments', data);
  return res.data;
}

export async function listMyAppointments(): Promise<Appointment[]> {
  const res = await apiClient.get<Appointment[]>('/appointments/mine');
  return res.data;
}

export async function getAppointment(id: string): Promise<Appointment> {
  const res = await apiClient.get<Appointment>(`/appointments/${id}`);
  return res.data;
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>(`/appointments/${id}/cancel`);
  return res.data;
}

export async function getQueue(doctorId?: string, date?: string): Promise<Appointment[]> {
  const res = await apiClient.get<Appointment[]>('/appointments/queue', {
    params: { doctorId, date },
  });
  return res.data;
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
  const res = await apiClient.patch<Appointment>(`/appointments/${id}/status`, { status });
  return res.data;
}

export async function registerWalkIn(data: WalkInRequest): Promise<Appointment> {
  const res = await apiClient.post<Appointment>('/appointments/walk-in', data);
  return res.data;
}
