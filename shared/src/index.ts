// Shared types used by the server, web app, and mobile app.
// Keep this the single source of truth for the API contract.

export type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'PHARMACIST' | 'LAB_TECHNICIAN';

export type AppointmentStatus =
  | 'BOOKED'
  | 'CHECKED_IN'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

// 1 = OPD only, 2 = + Pharmacy/Lab, 3 = + In-Patient (IPD, not built yet)
export type ClinicTier = 1 | 2 | 3;

export interface ClinicSummary {
  id: string;
  slug: string;
  name: string;
  tier: ClinicTier;
  logoUrl: string | null;
  taxPercent: number;
}

export interface PublicUser {
  id: string;
  clinicId: string;
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

export interface LabTestOrder {
  id: string;
  consultationId: string;
  testName: string;
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
  labTestsOrdered: LabTestOrder[];
}

// ---- Auth / Clinics ----

export interface RegisterClinicRequest {
  clinicName: string;
  clinicSlug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  tier?: ClinicTier;
}

export interface RegisterRequest {
  clinicSlug: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
}

export interface LoginRequest {
  clinicSlug: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
  clinic: ClinicSummary;
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

export interface LabTestOrderInput {
  testName: string;
  notes?: string;
}

export interface SaveConsultationRequest {
  vitals?: Vitals;
  diagnosis?: string;
  notes?: string;
  prescriptions?: PrescriptionInput[];
  labTestsOrdered?: LabTestOrderInput[];
  complete?: boolean;
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

export interface CreateStaffRequest {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: Extract<Role, 'PHARMACIST' | 'LAB_TECHNICIAN'>;
}

export interface UpsertScheduleRequest {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// ---- Pharmacy (Tier 2+) ----

export interface PharmacyItem {
  id: string;
  name: string;
  unitsPerStrip: number | null;
  pricePerUnit: number;
  costPricePerUnit: number;
  stockUnits: number;
}

export interface UpsertPharmacyItemRequest {
  name: string;
  unitsPerStrip?: number | null;
  pricePerUnit: number;
  costPricePerUnit: number;
  stockUnits: number;
}

// A prescription line from a patient's visit, annotated with a best-effort
// catalog match so the counter can pre-fill quantity/price while still
// allowing free-text entry when nothing matches.
export interface PendingPharmacyLine {
  prescriptionId: string;
  appointmentId: string;
  appointmentDate: string;
  medicine: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  matchedItem: PharmacyItem | null;
  suggestedQuantity: number;
  suggestedUnitPrice: number;
  alreadyDispensed: boolean;
}

export interface PharmacySaleItemInput {
  prescriptionId?: string;
  itemId?: string;
  medicineName: string;
  quantity: number;
  unitPrice: number;
}

export interface CreatePharmacySaleRequest {
  patientId: string;
  appointmentId?: string;
  items: PharmacySaleItemInput[];
}

export interface PharmacySaleItem {
  id: string;
  prescriptionId: string | null;
  itemId: string | null;
  medicineName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PharmacySale {
  id: string;
  patientId: string;
  patient?: PublicUser;
  appointmentId: string | null;
  soldById: string;
  taxPercent: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  createdAt: string;
  items: PharmacySaleItem[];
}

// ---- Lab (Tier 2+) ----

export interface LabTestCatalogEntry {
  id: string;
  name: string;
  price: number;
}

export interface UpsertLabTestCatalogRequest {
  name: string;
  price: number;
}

export interface PendingLabLine {
  orderId: string;
  appointmentId: string;
  appointmentDate: string;
  testName: string;
  notes: string | null;
  matchedTest: LabTestCatalogEntry | null;
  suggestedPrice: number;
  alreadyResulted: boolean;
}

export interface LabResultItemInput {
  orderId?: string;
  catalogItemId?: string;
  testName: string;
  resultText?: string;
  price: number;
}

export interface CreateLabInvoiceRequest {
  patientId: string;
  appointmentId?: string;
  items: LabResultItemInput[];
}

export interface LabResultItem {
  id: string;
  orderId: string | null;
  catalogItemId: string | null;
  testName: string;
  resultText: string | null;
  price: number;
}

export interface LabInvoice {
  id: string;
  patientId: string;
  patient?: PublicUser;
  appointmentId: string | null;
  recordedById: string;
  taxPercent: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  createdAt: string;
  items: LabResultItem[];
}

export interface PatientRecordsResponse {
  patient: PublicUser;
  appointments: Appointment[];
  pharmacySales: PharmacySale[];
  labInvoices: LabInvoice[];
}

export interface ApiError {
  message: string;
}
