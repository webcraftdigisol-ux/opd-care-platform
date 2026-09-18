import { apiClient } from './client';
import type { DoctorProfile, DoctorSlot, Schedule } from '@opd/shared';

export async function listDoctors(): Promise<DoctorProfile[]> {
  const res = await apiClient.get<DoctorProfile[]>('/doctors');
  return res.data;
}

export async function getDoctor(id: string): Promise<DoctorProfile> {
  const res = await apiClient.get<DoctorProfile>(`/doctors/${id}`);
  return res.data;
}

export async function getDoctorSchedule(id: string): Promise<Schedule[]> {
  const res = await apiClient.get<Schedule[]>(`/doctors/${id}/schedule`);
  return res.data;
}

export async function getDoctorSlots(id: string, date: string): Promise<DoctorSlot[]> {
  const res = await apiClient.get<DoctorSlot[]>(`/doctors/${id}/slots`, { params: { date } });
  return res.data;
}
