// Shared types used by the server, web app, and mobile app.
// Keep this the single source of truth for the API contract.

export type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export type AppointmentStatus =
  | 'BOOKED'
  | 'CHECKED_IN'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface PublicUser {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  role: Role;
  createdAt: string;
}

export interface DoctorProfile {
  id: string;
  userId: string;
  specialization: string;
  department: string;
  slotMinutes: number;
  user: PublicUser;
}

export interface Schedule {
  id: string;
  doctorId: string;
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
  startTime: string; // "HH:mm" 24h
  endTime: string; // "HH:mm" 24h
}

export interface Appointment {
  id: string;
  patientId: string;
  patient?: PublicUser;
  doctorId: string;
  doctor?: DoctorProfile;
  date: string; // ISO date (day only, e.g. 2026-09-18)
  tokenNumber: number;
  status: AppointmentStatus;
  isWalkIn: boolean;
  reason: string | null;
  createdAt: string;
  consultation?: Consultation | null;
}

export interface Vitals {
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  tempC?: number;
  weightKg?: number;
  heightCm?: number;
  spo2?: number;
}

export interface Prescription {
  id: string;
  consultationId: string;
  medicine: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  notes: string | null;
}

export interface Consultation {
  id: string;
  appointmentId: string;
  vitals: Vitals | null;
  diagnosis: string | null;
  notes: string | null;
  createdAt: string;
  prescriptions: Prescription[];
}

// ---- Auth ----

export interface RegisterRequest {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role?: Extract<Role, 'PATIENT'>; // public registration is patient-only
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

// ---- Appointments ----

export interface BookAppointmentRequest {
  doctorId: string;
  date: string; // "YYYY-MM-DD"
  reason?: string;
}

export interface WalkInRequest {
  doctorId: string;
  patientName: string;
  patientPhone: string;
  reason?: string;
}

export interface UpdateAppointmentStatusRequest {
  status: AppointmentStatus;
}

// ---- Consultations ----

export interface PrescriptionInput {
  medicine: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  notes?: string;
}

export interface SaveConsultationRequest {
  vitals?: Vitals;
  diagnosis?: string;
  notes?: string;
  prescriptions?: PrescriptionInput[];
}

// ---- Admin ----

export interface CreateDoctorRequest {
  name: string;
  email: string;
  phone?: string;
  password: string;
  specialization: string;
  department: string;
  slotMinutes?: number;
}

export interface UpsertScheduleRequest {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface ApiError {
  message: string;
}
