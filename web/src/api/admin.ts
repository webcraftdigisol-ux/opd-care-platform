import { apiClient } from './client';
import type {
  Appointment,
  CreateDoctorRequest,
  CreateStaffRequest,
  DoctorProfile,
  PublicUser,
  Schedule,
  UpsertScheduleRequest,
} from '@opd/shared';

export async function createDoctor(data: CreateDoctorRequest): Promise<DoctorProfile> {
  const res = await apiClient.post<DoctorProfile>('/admin/doctors', data);
  return res.data;
}

export async function updateDoctorSchedule(doctorId: string, slots: UpsertScheduleRequest[]): Promise<Schedule[]> {
  const res = await apiClient.put<Schedule[]>(`/admin/doctors/${doctorId}/schedule`, { slots });
  return res.data;
}

export async function listAllAppointments(date?: string): Promise<Appointment[]> {
  const res = await apiClient.get<Appointment[]>('/admin/appointments', { params: { date } });
  return res.data;
}

export async function createStaff(data: CreateStaffRequest): Promise<PublicUser> {
  const res = await apiClient.post<PublicUser>('/admin/staff', data);
  return res.data;
}

export async function listStaff(): Promise<PublicUser[]> {
  const res = await apiClient.get<PublicUser[]>('/admin/staff');
  return res.data;
}
