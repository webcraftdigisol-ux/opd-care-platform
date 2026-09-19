// Shared types used by the server, web app, and mobile app.
// Keep this the single source of truth for the API contract.

export type Role =
  | 'PATIENT'
  | 'DOCTOR'
  | 'ADMIN'
  | 'PHARMACIST'
  | 'LAB_TECHNICIAN'
  | 'RADIOLOGY_TECHNICIAN'
  | 'RECEPTIONIST'
  | 'NURSE'
  | 'HEAD_NURSE';

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
  consultationFee: number;
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
  // "HH:mm", 24h. Set for a patient-booked, fixed-slot appointment; null for
  // a walk-in, which is queued in as-they-arrive rather than pre-slotted.
  startTime: string | null;
  status: AppointmentStatus;
  isWalkIn: boolean;
  reason: string | null;
  consultationFee: number;
  createdAt: string;
  consultation?: Consultation | null;
}

export interface DoctorSlot {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  available: boolean;
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

export interface RadiologyTestOrder {
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
  followUpDate: string | null;
  followUpContacted: boolean;
  createdAt: string;
  prescriptions: Prescription[];
  labTestsOrdered: LabTestOrder[];
  radiologyOrdered: RadiologyTestOrder[];
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
  startTime: string; // "HH:mm"
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

export interface RadiologyTestOrderInput {
  testName: string;
  notes?: string;
}

export interface SaveConsultationRequest {
  vitals?: Vitals;
  diagnosis?: string;
  notes?: string;
  followUpDate?: string; // "YYYY-MM-DD"
  prescriptions?: PrescriptionInput[];
  labTestsOrdered?: LabTestOrderInput[];
  radiologyOrdered?: RadiologyTestOrderInput[];
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
  consultationFee?: number;
}

export interface UpdateDoctorRequest {
  specialization?: string;
  department?: string;
  slotMinutes?: number;
  consultationFee?: number;
}

export interface CreateStaffRequest {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: Extract<
    Role,
    'PHARMACIST' | 'LAB_TECHNICIAN' | 'RADIOLOGY_TECHNICIAN' | 'RECEPTIONIST' | 'NURSE' | 'HEAD_NURSE'
  >;
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
  admissionId?: string;
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
  admissionId: string | null;
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
  admissionId?: string;
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
  admissionId: string | null;
  recordedById: string;
  taxPercent: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  createdAt: string;
  items: LabResultItem[];
}

// ---- Radiology (Tier 2+) ----
// Mirrors Lab's shapes exactly — same counter auto-match pattern.

export interface RadiologyTestCatalogEntry {
  id: string;
  name: string;
  price: number;
}

export interface UpsertRadiologyTestCatalogRequest {
  name: string;
  price: number;
}

export interface PendingRadiologyLine {
  orderId: string;
  appointmentId: string;
  appointmentDate: string;
  testName: string;
  notes: string | null;
  matchedTest: RadiologyTestCatalogEntry | null;
  suggestedPrice: number;
  alreadyResulted: boolean;
}

export interface RadiologyResultItemInput {
  orderId?: string;
  catalogItemId?: string;
  testName: string;
  resultText?: string;
  price: number;
}

export interface CreateRadiologyInvoiceRequest {
  patientId: string;
  appointmentId?: string;
  admissionId?: string;
  items: RadiologyResultItemInput[];
}

export interface RadiologyResultItem {
  id: string;
  orderId: string | null;
  catalogItemId: string | null;
  testName: string;
  resultText: string | null;
  price: number;
}

export interface RadiologyInvoice {
  id: string;
  patientId: string;
  patient?: PublicUser;
  appointmentId: string | null;
  admissionId: string | null;
  recordedById: string;
  taxPercent: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  createdAt: string;
  items: RadiologyResultItem[];
}

export interface PatientRecordsResponse {
  patient: PublicUser;
  appointments: Appointment[];
  pharmacySales: PharmacySale[];
  labInvoices: LabInvoice[];
  radiologyInvoices: RadiologyInvoice[];
  attachments: Attachment[];
}

// ---- Reports ----

// "Actual" = real transactions that happened in-house, at their own recorded
// price. "Total ordered" = everything a doctor ordered in the date range,
// whether fulfilled in-house or not — an item that was billed keeps its own
// recorded charge here too (never re-derived from a fresh catalog lookup),
// and an item never billed is valued at current catalog pricing when a name
// match exists. This number must never shrink just because something later
// gets fulfilled.
export interface ReportItemBreakdown {
  name: string;
  actualQuantity: number;
  actualTotal: number;
  orderedQuantity: number;
  orderedTotal: number;
  unmatchedOrderedCount: number;
}

export interface RevenueSection {
  actual: { count: number; total: number };
  totalOrdered: { count: number; total: number; unmatchedCount: number };
  byItem: ReportItemBreakdown[];
}

export interface FinancialReport {
  from: string;
  to: string;
  pharmacy: RevenueSection;
  lab: RevenueSection;
  radiology: RevenueSection;
}

export interface DoctorActivitySummary {
  doctorId: string;
  doctorName: string;
  total: number;
  completed: number;
}

export interface DailyActivityReport {
  date: string;
  totalAppointments: number;
  booked: number;
  walkIns: number;
  completed: number;
  cancelled: number;
  noShow: number;
  byDoctor: DoctorActivitySummary[];
}

export interface FollowUpItem {
  consultationId: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  doctorName: string;
  followUpDate: string;
  contacted: boolean;
}

export interface FollowUpsReport {
  overdue: FollowUpItem[];
  dueToday: FollowUpItem[];
  dueThisWeek: FollowUpItem[];
}

// ---- In-Patient / IPD (Tier 3) ----

export type BedStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';
export type AdmissionStatus = 'ADMITTED' | 'DISCHARGED';
export type MedicationSource = 'CLINIC_SUPPLIED' | 'PATIENT_OWN';

export interface Bed {
  id: string;
  wardId: string;
  label: string;
  dailyRate: number;
  status: BedStatus;
  wardName?: string;
}

export interface Ward {
  id: string;
  name: string;
  beds: Bed[];
}

export interface CreateWardRequest {
  name: string;
}

export interface BulkAddBedsRequest {
  startNumber: number;
  count: number;
  prefix?: string;
  dailyRate: number;
}

export interface DoctorVisitRecord {
  id: string;
  admissionId: string;
  doctorId: string;
  doctorName: string;
  notes: string | null;
  fee: number;
  visitedAt: string;
}

export interface ProcedureRecord {
  id: string;
  admissionId: string;
  name: string;
  notes: string | null;
  consentSigned: boolean;
  fee: number;
  performedAt: string;
}

export interface MedicationRecord {
  id: string;
  admissionId: string;
  medicine: string;
  dosage: string;
  quantity: number;
  unitPrice: number;
  source: MedicationSource;
  givenAt: string;
}

export interface VitalsRecord {
  id: string;
  admissionId: string;
  pulse: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  tempC: number | null;
  spo2: number | null;
  recordedById: string;
  recordedByName: string;
  recordedAt: string;
}

export interface ChargeRecord {
  id: string;
  admissionId: string;
  description: string;
  amount: number;
  chargedAt: string;
}

export interface RoomTransferRecord {
  id: string;
  admissionId: string;
  fromBedLabel: string | null;
  toBedLabel: string;
  transferredAt: string;
}

export interface Admission {
  id: string;
  patientId: string;
  patient?: PublicUser;
  bedId: string;
  bedLabel: string;
  wardName: string;
  admittingDoctorId: string;
  admittingDoctorName: string;
  reason: string | null;
  depositAmount: number;
  status: AdmissionStatus;
  admittedAt: string;
  dischargedAt: string | null;
  dischargeSummary: string | null;
}

// amountDue can be negative — a refund owed when the deposit exceeded the
// final bill. A snapshot taken at discharge, not recomputed afterward.
export interface IpdBill {
  id: string;
  admissionId: string;
  roomCharges: number;
  doctorVisitCharges: number;
  procedureCharges: number;
  medicationCharges: number;
  adHocCharges: number;
  pharmacyCharges: number;
  labCharges: number;
  radiologyCharges: number;
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  depositAmount: number;
  amountDue: number;
  createdAt: string;
}

export interface AdmissionDetail extends Admission {
  roomTransfers: RoomTransferRecord[];
  doctorVisits: DoctorVisitRecord[];
  procedures: ProcedureRecord[];
  medications: MedicationRecord[];
  vitalsLogs: VitalsRecord[];
  charges: ChargeRecord[];
  pharmacySales: PharmacySale[];
  labInvoices: LabInvoice[];
  radiologyInvoices: RadiologyInvoice[];
  bill: IpdBill | null;
}

export interface AdmitPatientRequest {
  patientId: string;
  bedId: string;
  admittingDoctorId: string;
  reason?: string;
  depositAmount?: number;
}

export interface TransferRoomRequest {
  toBedId: string;
}

export interface AddDoctorVisitRequest {
  doctorId: string;
  notes?: string;
  fee?: number;
}

export interface AddProcedureRequest {
  name: string;
  notes?: string;
  consentSigned: boolean;
  fee?: number;
}

export interface AddMedicationRequest {
  medicine: string;
  dosage: string;
  quantity: number;
  unitPrice?: number;
  source: MedicationSource;
}

export interface AddVitalsRequest {
  pulse?: number;
  bpSystolic?: number;
  bpDiastolic?: number;
  tempC?: number;
  spo2?: number;
}

export interface AddChargeRequest {
  description: string;
  amount: number;
}

export interface DischargeRequest {
  dischargeSummary?: string;
}

// ---- Payments ----

export type BillType = 'CONSULTATION' | 'PHARMACY' | 'LAB' | 'RADIOLOGY' | 'IPD';
export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'NETBANKING' | 'WALLET' | 'RAZORPAY';

export interface Payment {
  id: string;
  patientId: string;
  billType: BillType;
  billId: string;
  amount: number;
  method: PaymentMethod;
  recordedById: string;
  recordedByName?: string;
  createdAt: string;
}

export interface RecordPaymentRequest {
  billType: BillType;
  billId: string;
  amount: number;
  method: PaymentMethod;
}

export interface BillPaymentsResponse {
  billType: BillType;
  billId: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  payments: Payment[];
}

// ---- Notifications ----

export type NotificationChannel = 'EMAIL' | 'SMS';
export type NotificationType =
  | 'APPOINTMENT_CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'FOLLOWUP_REMINDER'
  | 'DISCHARGE_SUMMARY'
  | 'APPOINTMENT_REMINDER';
export type NotificationStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export interface Notification {
  id: string;
  patientId: string | null;
  patientName?: string | null;
  channel: NotificationChannel;
  type: NotificationType;
  recipient: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  error: string | null;
  createdAt: string;
}

// ---- Attachments ----

// entityId is polymorphic on category -- a LabInvoice id for LAB_REPORT, a
// RadiologyInvoice id for RADIOLOGY_REPORT and RADIOLOGY_DICOM (a raw
// DICOM export attaches to the same invoice a written report does), a
// Consultation id for PRESCRIPTION_SCAN. See
// server/src/routes/attachments.routes.ts.
export type AttachmentCategory = 'LAB_REPORT' | 'RADIOLOGY_REPORT' | 'PRESCRIPTION_SCAN' | 'RADIOLOGY_DICOM';

export interface Attachment {
  id: string;
  patientId: string;
  category: AttachmentCategory;
  entityId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedByName?: string;
  createdAt: string;
}

export interface ApiError {
  message: string;
}

// ---- Subscription billing ----
//
// Platform-admin-only concept: a clinic's own ADMIN never sees this, it's
// managed entirely by the platform (you), not the clinic itself. See
// server/prisma/schema.prisma's "Subscription billing" section for why this
// is a separate PlatformAdmin identity rather than another Role.

export type BillingCycle = 'MONTHLY' | 'ANNUAL';
export type SubscriptionStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

export interface Subscription {
  id: string;
  clinicId: string;
  tier: ClinicTier;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  amount: number;
  currentPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
  // Derived, not stored: status === 'ACTIVE' AND currentPeriodEnd hasn't
  // passed yet. See isSubscriptionActive() in server/src/middleware/auth.ts
  // -- included here so the platform dashboard doesn't need to re-derive
  // the same date math the server already computed.
  isActive: boolean;
}

export interface SubscriptionPayment {
  id: string;
  subscriptionId: string;
  amount: number;
  billingCycle: BillingCycle;
  periodStart: string;
  periodEnd: string;
  recordedAt: string;
  recordedByAdminName: string | null;
  notes: string | null;
}

// The platform dashboard's list view: a clinic plus its (always-present,
// since registration auto-creates one) subscription.
export interface ClinicWithSubscription {
  id: string;
  slug: string;
  name: string;
  tier: ClinicTier;
  createdAt: string;
  subscription: Subscription;
}

export interface PlatformAdminAuthResponse {
  token: string;
  admin: { id: string; name: string; email: string };
}

export interface RenewSubscriptionRequest {
  tier: ClinicTier;
  billingCycle: BillingCycle;
  amount?: number; // defaults to the tier/cycle's suggested price when omitted
  notes?: string;
}

// Single source of truth for both sides: the server sets this exact string
// as the message on every 403 it sends for an inactive subscription (login,
// registration, and every requireAuth-gated route), and the web app string-
// matches against it to show a dedicated lockout screen instead of a
// generic error toast. Keep them in lockstep -- see
// server/src/middleware/auth.ts and web/src/api/client.ts.
export const SUBSCRIPTION_INACTIVE_MESSAGE =
  "This clinic's subscription is not active. Contact your platform administrator to restore access.";
