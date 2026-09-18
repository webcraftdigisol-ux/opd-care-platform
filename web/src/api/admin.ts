import { apiClient } from './client';
import type {
  Appointment,
  CreateDoctorRequest,
  CreateStaffRequest,
  DoctorProfile,
  Notification,
  PublicUser,
  Schedule,
  UpdateDoctorRequest,
  UpsertScheduleRequest,
} from '@opd/shared';

export async function createDoctor(data: CreateDoctorRequest): Promise<DoctorProfile> {
  const res = await apiClient.post<DoctorProfile>('/admin/doctors', data);
  return res.data;
}

export async function updateDoctor(doctorId: string, data: UpdateDoctorRequest): Promise<DoctorProfile> {
  const res = await apiClient.put<DoctorProfile>(`/admin/doctors/${doctorId}`, data);
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

export async function listNotifications(patientId?: string): Promise<Notification[]> {
  const res = await apiClient.get<Notification[]>('/admin/notifications', { params: { patientId } });
  return res.data;
}
