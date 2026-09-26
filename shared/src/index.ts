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
  address: string | null;
  phone: string | null;
}

export interface PublicUser {
  id: string;
  clinicId: string;
  email: string;
  phone: string | null;
  name: string;
  role: Role;
  createdAt: string;
  whatsappOptIn: boolean;
  // Staff only: sign-in name and whether the account can sign in.
  username?: string | null;
  active?: boolean;
  // A patient's Patient ID (PT000001); set on patients when the record was
  // loaded with its profile, otherwise absent.
  patientCode?: string | null;
}

export interface DoctorProfile {
  id: string;
  userId: string;
  specialization: string;
  department: string;
  slotMinutes: number;
  consultationFee: number;
  qualification: string | null;
  registrationNumber: string | null;
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
  // Null for a booking for someone not registered yet (see guestName).
  patientId: string | null;
  patient?: PublicUser;
  guestName: string | null;
  guestPhone: string | null;
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

export type BloodSugarType = 'FASTING' | 'PP' | 'RANDOM';

export interface Vitals {
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  // New visits record °F; older ones have °C. Show whichever is set.
  tempF?: number;
  tempC?: number;
  respiratoryRate?: number;
  weightKg?: number;
  heightCm?: number;
  spo2?: number;
  bloodSugar?: number; // mg/dL
  bloodSugarType?: BloodSugarType;
}

export type FoodTiming = 'BEFORE_FOOD' | 'AFTER_FOOD' | 'WITH_FOOD' | 'EMPTY_STOMACH';

export interface Prescription {
  id: string;
  consultationId: string;
  medicine: string;
  strength: string | null;
  brand: string | null;
  dosage: string; // per time, e.g. "1 tab"
  frequency: string; // "1-0-1" or free text such as "SOS"
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  foodTiming: FoodTiming | null;
  durationDays: number;
  notes: string | null; // instructions
  // Doses per day × days, when the timing is ticks or an "x-x-x" pattern.
  totalToDispense: number | null;
}

export type DietaryPreference = 'VEG' | 'NON_VEG' | 'EGGETARIAN' | 'VEGAN';

export interface DietPlan {
  id: string;
  clinicId: string;
  patientId: string;
  consultationId: string | null;
  admissionId: string | null;
  createdById: string;
  createdByName?: string;
  dietaryPreference: DietaryPreference;
  allergies: string | null;
  localFoodNotes: string | null;
  planText: string;
  createdAt: string;
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
  chiefComplaint: string | null;
  presentIllness: string | null;
  relevantHistory: string | null;
  diagnosis: string | null;
  differentialDiagnosis: string | null;
  notes: string | null; // the doctor's advice to the patient
  imagingAdvice: string | null;
  // Private to clinic staff; always null for the patient.
  doctorNotes: string | null;
  followUpDate: string | null;
  followUpContacted: boolean;
  createdAt: string;
  updatedAt: string;
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

// Forgot-password over WhatsApp. `identifier` is the account's email or
// phone number at that clinic.
export interface PasswordResetRequest {
  clinicSlug: string;
  identifier: string;
}

export interface PasswordResetConfirmRequest {
  clinicSlug: string;
  identifier: string;
  code: string;
  newPassword: string;
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
  // An already-registered patient (from the search). Without it a new
  // patient is registered from patientName + patientPhone -- a shared
  // family number never silently reuses someone else's record.
  patientId?: string;
  patientName?: string;
  patientPhone?: string;
  reason?: string;
  // The patient agreed, at the desk, to receive WhatsApp messages. Only
  // ever turns consent on -- leaving it unset never revokes it.
  whatsappOptIn?: boolean;
}

// Staff booking from the Appointments page: a registered patient (picked
// from the search) or, for a phone booking, just a name and maybe a mobile.
export interface ScheduleAppointmentRequest {
  doctorId: string;
  date: string; // "YYYY-MM-DD"
  time?: string | null; // "HH:mm", optional -- no slot grid
  reason?: string;
  patientId?: string;
  guestName?: string;
  guestPhone?: string;
}

export interface RescheduleAppointmentRequest {
  date?: string;
  time?: string | null;
  doctorId?: string;
  reason?: string | null;
}

// Turning a booking for someone not registered yet into a real patient on
// arrival: link a registered patient (a family member found by mobile) or
// register a new one from the booking's name and mobile.
export interface RegisterBookingRequest {
  patientId?: string;
  name?: string;
  phone?: string;
  checkIn?: boolean;
}

export interface DashboardDay {
  date: string; // "YYYY-MM-DD"
  appointments: number;
  revenue: number | null; // collected that day; null when not shown to this role
}

export interface DashboardSummary {
  date: string;
  totalPatients: number;
  registeredToday: number;
  appointmentsToday: number;
  revenueThisMonth: number | null;
  month: string; // "YYYY-MM"
  days: DashboardDay[];
}

export interface UpdateAppointmentStatusRequest {
  status: AppointmentStatus;
}

// ---- Consultations ----

export interface PrescriptionInput {
  medicine: string;
  strength?: string | null;
  brand?: string | null;
  dosage?: string; // defaults to "1"
  // Either tick the times of day, or give a frequency ("1-0-1", "SOS").
  morning?: boolean;
  afternoon?: boolean;
  night?: boolean;
  frequency?: string;
  foodTiming?: FoodTiming | null;
  durationDays: number;
  notes?: string;
}

export interface DietPlanInput {
  patientId: string;
  consultationId?: string;
  admissionId?: string;
  dietaryPreference: DietaryPreference;
  allergies?: string;
  localFoodNotes?: string;
  planText: string;
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
  chiefComplaint?: string;
  presentIllness?: string;
  relevantHistory?: string;
  diagnosis?: string;
  differentialDiagnosis?: string;
  notes?: string;
  imagingAdvice?: string;
  doctorNotes?: string;
  // Changes this visit's fee (a discount, a free review); can't go below
  // what has already been paid.
  consultationFee?: number;
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
  qualification?: string;
  registrationNumber?: string;
}

export interface UpdateDoctorRequest {
  specialization?: string;
  department?: string;
  slotMinutes?: number;
  consultationFee?: number;
  qualification?: string | null;
  registrationNumber?: string | null;
}

// ---- Doctor's Catalogue ----

export type CatalogKind = 'MEDICINE' | 'LAB_TEST' | 'RADIOLOGY';

export interface DoctorCatalogItem {
  id: string;
  kind: CatalogKind;
  name: string;
  strength: string | null;
  brands: string[]; // medicines only
}

export interface UpsertCatalogItemRequest {
  kind: CatalogKind;
  name: string;
  strength?: string | null;
  brands?: string[];
}

// What the consultation screen suggests while typing: the Doctor's
// Catalogue plus, in Tier 2+, the department catalogues.
export interface CatalogSuggestionLists {
  medicines: { name: string; strength: string | null; brands: string[] }[];
  labTests: string[];
  radiology: string[];
}

// The clinic's own lists, and the standard list's entries the clinic
// doesn't have -- offered after the clinic's own, so typing "C" finds CBC
// even before a list is loaded.
export interface CatalogSuggestions extends CatalogSuggestionLists {
  standard: CatalogSuggestionLists;
}

// Everything the patient's printed/shared Visit Summary shows -- and
// deliberately nothing more: no differential diagnosis, relevant history,
// fee or the doctor's private notes.
export interface VisitSummary {
  appointmentId: string;
  visitNumber: number; // this patient's nth consulted visit at the clinic
  date: string; // "YYYY-MM-DD"
  time: string | null; // "HH:mm", when the visit was recorded
  clinic: { name: string; address: string | null; phone: string | null; logoUrl: string | null };
  doctor: { name: string; specialization: string; qualification: string | null; registrationNumber: string | null };
  patient: { id: string; name: string; patientCode: string; age: number | null; gender: Gender | null; phone: string | null };
  symptoms: string[]; // chief complaint, then present illness
  diagnosis: string | null;
  vitals: Vitals | null;
  prescriptions: Prescription[];
  labTests: { name: string; notes: string | null }[];
  radiology: { name: string; notes: string | null }[];
  advice: string | null;
  imagingAdvice: string | null;
  followUpDate: string | null;
}

// Starting a consultation from the patient's profile (no token first).
export interface StartVisitRequest {
  patientId: string;
  doctorId?: string; // a doctor starts with themself
  reason?: string;
}

export interface UpdateClinicRequest {
  name?: string;
  address?: string | null;
  phone?: string | null;
}

export type StaffRole = Extract<
  Role,
  'ADMIN' | 'PHARMACIST' | 'LAB_TECHNICIAN' | 'RADIOLOGY_TECHNICIAN' | 'RECEPTIONIST' | 'NURSE' | 'HEAD_NURSE'
>;

// A staff account signs in with a username, an email, or both. (Doctors are
// added on the Doctors page, which also sets up their schedule and fee.)
export interface CreateStaffRequest {
  name: string;
  username?: string;
  email?: string;
  phone?: string;
  password: string;
  role: StaffRole;
}

export interface UpdateStaffRequest {
  name?: string;
  role?: StaffRole;
  phone?: string | null;
  active?: boolean;
}

export interface ResetStaffPasswordRequest {
  password: string;
}

// ---- Revenue report (the offline-style transactions view) ----

export interface TransactionRow {
  billType: BillType;
  billId: string;
  date: string; // ISO timestamp
  patientId: string | null;
  patientName: string;
  patientCode: string | null;
  doctorName: string | null;
  description: string;
  billed: number;
  collected: number;
  outstanding: number;
  status: 'PAID' | 'PARTLY_PAID' | 'UNPAID' | 'NO_CHARGE';
}

export interface TransactionsReport {
  from: string;
  to: string;
  rows: TransactionRow[]; // oldest first
  byDay: { date: string; count: number; billed: number; collected: number }[];
  byType: { billType: BillType; count: number; billed: number; collected: number }[];
  byMethod: { method: PaymentMethod; amount: number }[];
  totals: { count: number; billed: number; collected: number; outstanding: number };
}

export interface UpsertScheduleRequest {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// ---- Pharmacy (Tier 2+) ----

export interface PharmacyItem {
  id: string;
  // Generic / composition name ("Paracetamol"); with strength it decides
  // which brands can stand in for each other.
  name: string;
  strength: string | null;
  brand: string | null;
  unitsPerStrip: number | null;
  pricePerUnit: number;
  costPricePerUnit: number;
  stockUnits: number;
}

export interface UpsertPharmacyItemRequest {
  name: string;
  strength?: string | null;
  brand?: string | null;
  unitsPerStrip?: number | null;
  // MRP per unit; 0 = not priced yet.
  pricePerUnit: number;
  costPricePerUnit: number;
  stockUnits?: number;
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
  // What the doctor prescribed, when something else was dispensed.
  substitutedFor: string | null;
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
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
  // What it costs the clinic, for profit.
  cost: number;
}

export interface UpsertLabTestCatalogRequest {
  name: string;
  price: number;
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
  substitutedFor: string | null;
  cost: number | null;
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
  cost: number;
}

export interface UpsertRadiologyTestCatalogRequest {
  name: string;
  price: number;
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
  substitutedFor: string | null;
  cost: number | null;
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

// ---- Department counters (Tier 2+): pharmacy, lab, radiology ----

export type Department = 'PHARMACY' | 'LAB' | 'RADIOLOGY';

// Who the counter is serving, as shown in its header and queue.
export interface DeptPatient {
  id: string;
  name: string;
  patientCode: string | null;
  gender: Gender | null;
  age: number | null;
  phone: string | null;
}

// PENDING: still to do here; DONE: dispensed / done in-house (possibly as
// a substitute); SKIPPED: marked as not being done here.
export type OrderLineStatus = 'PENDING' | 'DONE' | 'SKIPPED';

// A patient waiting at a counter: a visit with orders not yet done.
export interface DeptQueueEntry {
  patient: DeptPatient;
  appointmentId: string;
  visitDate: string; // "YYYY-MM-DD"
  doctorName: string;
  pending: number;
  total: number;
  // The pending items' names, for a one-line preview.
  items: string[];
}

export interface PharmacyOrderLine {
  prescriptionId: string;
  medicine: string;
  strength: string | null;
  brand: string | null;
  // "Dolo 650 (Paracetamol 650 mg)" -- as the doctor wrote it.
  label: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  foodTiming: string | null;
  notes: string | null;
  status: OrderLineStatus;
  skipReason: string | null;
  dispensed: { saleId: string; medicineName: string; quantity: number; lineTotal: number; substitutedFor: string | null }[];
  suggestedQuantity: number;
  // The product to dispense by default: the prescribed brand if stocked,
  // else another brand of the same composition (in stock first).
  match: PharmacyItem | null;
  // Every stocked product of the same composition (name + strength).
  substitutes: PharmacyItem[];
}

export interface TestOrderLine {
  orderId: string;
  testName: string;
  notes: string | null;
  status: OrderLineStatus;
  skipReason: string | null;
  done: { invoiceId: string; itemId: string; testName: string; price: number; resultText: string | null }[];
  match: LabTestCatalogEntry | null;
}

export interface DeptVisit<L> {
  appointmentId: string;
  consultationId: string;
  date: string; // "YYYY-MM-DD"
  doctorName: string;
  diagnosis: string | null;
  lines: L[];
}

export interface PharmacyPatientOrders {
  patient: DeptPatient;
  visits: DeptVisit<PharmacyOrderLine>[];
  sales: PharmacySale[];
}

export interface TestPatientOrders {
  patient: DeptPatient;
  visits: DeptVisit<TestOrderLine>[];
  invoices: LabInvoice[];
}

export interface SkipOrderRequest {
  reason?: string;
}

// A printable receipt for any department bill.
export interface Receipt {
  billType: Department;
  billId: string;
  receiptNo: string;
  createdAt: string;
  clinic: { name: string; address: string | null; phone: string | null };
  patient: DeptPatient;
  doctorName: string | null;
  preparedBy: string | null;
  lines: { description: string; detail: string | null; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  paid: number;
  balance: number;
  payments: { method: PaymentMethod; amount: number; paidAt: string }[];
}

// ---- In-house revenue report ----
//
// Department level, in rupees: what the doctors prescribed or ordered in a
// date range (by visit day) and how much of it the clinic's own pharmacy,
// lab and radiology earned. Consultation fees are listed alongside. At a
// Tier 3 clinic each department also shows what it earned from admitted
// patients (IPD), and the IPD-only charges get rows of their own.

export type RevenueDepartment = 'CONSULTATION' | Department | 'ROOM' | 'PROCEDURE' | 'OTHER_IPD';

export interface DeptRevenue {
  department: RevenueDepartment;
  // Value of what was prescribed/ordered: the actual charge for what was
  // done in-house, the list price for what wasn't. For consultation, the
  // fees billed.
  ordered: number;
  inHouse: number;
  notInHouse: number;
  // Something not done in-house had no price in the list, so its value
  // is missing from `ordered` and `notInHouse`.
  hasUnpriced: boolean;
  // Charged to admitted patients (before tax): doctor visits, pharmacy
  // sales and clinic-supplied medicines, lab and radiology bills during a
  // stay; procedures, other charges; room charges on discharge.
  ipd: number;
}

export interface OrdersReport {
  from: string;
  to: string;
  departments: RevenueDepartment[];
  // Tier 3: the IPD column applies.
  hasIpd: boolean;
  summary: DeptRevenue[];
  byDay: { date: string; cells: DeptRevenue[] }[];
  byDoctor: { doctorId: string; doctorName: string; cells: DeptRevenue[] }[];
}

// ---- Department report: what each counter sold, with cost and profit ----

export interface DeptSaleLine {
  date: string; // ISO timestamp of the sale / bill
  billId: string;
  receiptNo: string;
  setting: 'OPD' | 'IPD';
  patientName: string;
  patientCode: string | null;
  doctorId: string | null;
  doctorName: string | null;
  item: string;
  quantity: number;
  unitPrice: number;
  revenue: number; // before tax
  cost: number;
  profit: number;
  // No cost was recorded at the time (older sales); today's list cost used.
  costEstimated: boolean;
}

export interface DepartmentReport {
  department: Department;
  from: string;
  to: string;
  lines: DeptSaleLine[];
  byDay: { date: string; revenue: number; cost: number; profit: number }[];
  byItem: { item: string; quantity: number; revenue: number; cost: number; profit: number }[];
  totals: { revenue: number; cost: number; profit: number; count: number };
}

// ---- Doctor's share of in-house profit (Tier 2+) ----

export type ShareDepartment = Department;

export interface ProfitShareRate {
  doctorId: string | null; // null: the clinic's default
  department: ShareDepartment;
  percent: number;
}

export interface DoctorShareRow {
  doctorId: string | null; // null: sales not linked to a doctor (over the counter)
  doctorName: string;
  department: ShareDepartment;
  revenue: number;
  cost: number;
  profit: number;
  percent: number; // the rate applied
  share: number; // the doctor's share of the profit (0 when there's a loss)
}

export interface DoctorShareReport {
  from: string;
  to: string;
  rows: DoctorShareRow[];
  totals: { revenue: number; cost: number; profit: number; share: number };
}

// ---- Patient record ----

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

// Everything the registration form collects. Only firstName and phone are
// required; the rest can be filled in later from the profile.
export interface PatientDetailsInput {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null; // "YYYY-MM-DD"
  ageYears?: number | null; // when the DOB isn't known
  bloodGroup?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  phone: string;
  alternatePhone?: string | null;
  email?: string | null;
  emergencyContact?: string | null;
  occupation?: string | null;
  referredBy?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  allergies?: string | null;
  chronicDiseases?: string | null;
  pastSurgeries?: string | null;
  familyHistory?: string | null;
  insuranceDetails?: string | null;
  tpa?: string | null;
  doctorNotes?: string | null;
  whatsappOptIn?: boolean;
}

export interface Patient {
  id: string; // the patient's user id -- what every other record points at
  patientCode: string;
  name: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  // Current age in whole years, from the DOB, or from the age given at
  // registration moved on by the time since; null when neither is known.
  age: number | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  phone: string | null;
  alternatePhone: string | null;
  // Null for staff-registered patients without a real email.
  email: string | null;
  emergencyContact: string | null;
  occupation: string | null;
  referredBy: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  heightCm: number | null;
  weightKg: number | null;
  allergies: string | null;
  chronicDiseases: string | null;
  pastSurgeries: string | null;
  familyHistory: string | null;
  insuranceDetails: string | null;
  tpa: string | null;
  doctorNotes: string | null;
  whatsappOptIn: boolean;
  registeredAt: string;
}

// One row in the as-you-type patient search.
export interface PatientSearchResult {
  id: string;
  patientCode: string;
  name: string;
  gender: Gender | null;
  age: number | null;
  phone: string | null;
  lastVisit: string | null; // "YYYY-MM-DD"
}

// One bill on the patient profile's Billing tab.
export interface PatientBill {
  billType: BillType;
  billId: string;
  label: string; // "OPD consultation — Visit 2", "Pharmacy sale", ...
  date: string; // ISO
  total: number;
  amountPaid: number;
  // Negative for an admission whose deposit exceeded the bill: a refund due.
  balanceDue: number;
  // An IPD admission's bill, line by line (room, doctor visits, procedures,
  // medicines, pharmacy, lab, radiology, other charges, tax, deposit).
  breakdown?: { label: string; amount: number }[];
  // Still admitted: the bill so far, not yet final.
  inProgress?: boolean;
}

export interface PatientBillingResponse {
  bills: PatientBill[]; // newest first
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
}

export interface PatientRecordsResponse {
  patient: PublicUser;
  appointments: Appointment[];
  pharmacySales: PharmacySale[];
  labInvoices: LabInvoice[];
  radiologyInvoices: RadiologyInvoice[];
  attachments: Attachment[];
  dietPlans: DietPlan[];
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
  // The signed consent form it was done under.
  consentFormId: string | null;
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
  // A signed consent form of this admission; implies consentSigned.
  consentFormId?: string;
  fee?: number;
}

// ---- IPD consent forms ----

export type ConsentKind = 'PROCEDURE' | 'SURGERY' | 'ANAESTHESIA' | 'BLOOD_TRANSFUSION' | 'HIGH_RISK';

export interface ConsentFormInput {
  kind: ConsentKind;
  procedureName: string;
  doctorId: string;
  plannedAt?: string | null; // ISO
  anaesthesia?: string | null;
  purpose?: string | null;
  risks?: string | null;
  alternatives?: string | null;
}

export interface SignConsentRequest {
  signedByName: string;
  signerRelation: string; // "Self", "Father", ...
  witnessName?: string | null;
}

export interface ConsentForm {
  id: string;
  admissionId: string;
  kind: ConsentKind;
  procedureName: string;
  doctorId: string;
  doctorName: string;
  plannedAt: string | null;
  anaesthesia: string | null;
  purpose: string | null;
  risks: string | null;
  alternatives: string | null;
  signedAt: string | null;
  signedByName: string | null;
  signerRelation: string | null;
  witnessName: string | null;
  createdAt: string;
}

// Everything the printed consent form shows.
export interface ConsentFormPrint extends ConsentForm {
  clinic: { name: string; address: string | null; phone: string | null };
  patient: { name: string; patientCode: string | null; age: number | null; gender: Gender | null };
  doctorQualification: string | null;
  doctorRegistrationNumber: string | null;
  ward: string;
  bed: string;
  admittedAt: string;
}

// ---- Medical certificates (all tiers) ----

export type CertificateType = 'MEDICAL_FITNESS' | 'SICK_LEAVE' | 'FIT_TO_RESUME' | 'FIT_TO_TRAVEL' | 'GENERAL';

export interface CertificateInput {
  type: CertificateType;
  // Admin issuing on a doctor's behalf picks the doctor; a doctor issues
  // their own.
  doctorId?: string;
  diagnosis?: string | null;
  fromDate?: string | null; // "YYYY-MM-DD"
  toDate?: string | null;
  purpose?: string | null;
  // The final wording, as approved on screen.
  body: string;
}

export interface MedicalCertificate {
  id: string;
  certificateNo: string;
  patientId: string;
  type: CertificateType;
  doctorId: string;
  doctorName: string;
  diagnosis: string | null;
  fromDate: string | null;
  toDate: string | null;
  purpose: string | null;
  body: string;
  issuedAt: string;
}

export interface CertificatePrint extends MedicalCertificate {
  clinic: { name: string; address: string | null; phone: string | null };
  patient: { name: string; patientCode: string | null; age: number | null; gender: Gender | null };
  doctorQualification: string | null;
  doctorRegistrationNumber: string | null;
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

// ---- Online payments (Razorpay) ----

export type PaymentOrderKind = 'BILL' | 'SUBSCRIPTION';

// keyId is Razorpay's public key id -- safe to hand to the browser, it
// identifies the merchant account to Checkout.js but authorizes nothing on
// its own (only key_secret, which never leaves the server, can do that).
export interface RazorpayOrderResponse {
  orderId: string;
  amount: number; // paise
  currency: string;
  keyId: string;
}

export interface CreateBillPaymentOrderRequest {
  billType: BillType;
  billId: string;
}

// Deliberately carries only what Razorpay's signed checkout callback itself
// hands back -- never billType/billId/amount, which the server looks up
// server-side from the PaymentOrder the razorpayOrderId points to, rather
// than trusting whatever the client claims they're paying for.
export interface VerifyRazorpayPaymentRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface RazorpayConfigStatus {
  configured: boolean;
}

// Returned by POST /payments/razorpay/verify -- shape depends on what kind
// of PaymentOrder the razorpayOrderId pointed to.
export interface VerifyBillPaymentResponse {
  billType: BillType;
  billId: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

export interface VerifySubscriptionPaymentResponse {
  tier: ClinicTier;
  currentPeriodEnd: string;
  status: SubscriptionStatus;
}

// ---- Notifications ----

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';
export type NotificationType =
  | 'APPOINTMENT_CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'FOLLOWUP_REMINDER'
  | 'DISCHARGE_SUMMARY'
  | 'APPOINTMENT_REMINDER'
  | 'PRESCRIPTION_SHARED'
  | 'DIET_PLAN_SHARED'
  | 'PASSWORD_RESET_OTP'
  | 'VISIT_SUMMARY_SHARED';
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
  providerMessageId: string | null;
  createdAt: string;
}

// POST /reports/follow-ups/:consultationId/remind -- one reminder goes out
// on both channels; each has its own outcome.
export interface FollowUpReminderResult {
  email: Notification;
  whatsapp: Notification;
}

// ---- Attachments ----

// entityId is polymorphic on category -- a LabInvoice id for LAB_REPORT, a
// RadiologyInvoice id for RADIOLOGY_REPORT and RADIOLOGY_DICOM (a raw
// DICOM export attaches to the same invoice a written report does), a
// Consultation id for PRESCRIPTION_SCAN, a ConsentForm id for
// CONSENT_FORM. See
// server/src/routes/attachments.routes.ts.
export type AttachmentCategory =
  | 'LAB_REPORT'
  | 'RADIOLOGY_REPORT'
  | 'PRESCRIPTION_SCAN'
  | 'RADIOLOGY_DICOM'
  | 'PATIENT_REPORT'
  | 'PATIENT_IMAGE'
  | 'CONSENT_FORM';

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
  // Set instead of recordedByAdminName when a clinic ADMIN paid online
  // (self-serve) rather than a platform admin recording it manually --
  // exactly one of the two is non-null.
  paidByUserName: string | null;
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

// Push the end date out by `days` with no payment recorded -- e.g. extending
// a trial. Counted from today if the subscription has already lapsed.
export interface ExtendSubscriptionRequest {
  days: number;
  reason: string;
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
