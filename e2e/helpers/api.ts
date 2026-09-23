// HTTP-based test-data setup against the real running API (started by
// playwright.config.ts's webServer). Each spec calls registerClinic() with
// a fresh random slug/email so specs never collide with each other, mirroring
// the isolation pattern used by server/tests/helpers.ts for Jest.

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4100/api';

export interface Session {
  token: string;
  user: { id: string; name: string; email: string; role: string };
  clinic: { id: string; name: string; slug: string; tier: number };
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

export async function registerClinic(opts: {
  clinicName: string;
  clinicSlug: string;
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
  tier?: 1 | 2 | 3;
}): Promise<Session> {
  return request<Session>('POST', '/clinics/register', {
    clinicName: opts.clinicName,
    clinicSlug: opts.clinicSlug,
    adminName: opts.adminName ?? 'Admin User',
    adminEmail: opts.adminEmail ?? uniqueEmail('admin'),
    adminPassword: opts.adminPassword ?? 'password123',
    tier: opts.tier ?? 1,
  });
}

export async function registerPatient(opts: {
  clinicSlug: string;
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
}): Promise<Session> {
  return request<Session>('POST', '/auth/register', {
    clinicSlug: opts.clinicSlug,
    name: opts.name ?? 'Test Patient',
    email: opts.email ?? uniqueEmail('patient'),
    password: opts.password ?? 'password123',
    phone: opts.phone,
  });
}

export async function login(opts: { clinicSlug: string; email: string; password?: string }): Promise<Session> {
  return request<Session>('POST', '/auth/login', {
    clinicSlug: opts.clinicSlug,
    email: opts.email,
    password: opts.password ?? 'password123',
  });
}

export async function bookAppointment(
  patientToken: string,
  opts: { doctorId: string; date: string; startTime: string },
): Promise<{ id: string }> {
  return request('POST', '/appointments', opts, patientToken);
}

export async function updateWhatsAppOptIn(token: string, whatsappOptIn: boolean): Promise<void> {
  await request('PUT', '/auth/me/whatsapp-optin', { whatsappOptIn }, token);
}

export async function createDoctor(
  adminToken: string,
  opts: {
    name?: string;
    email?: string;
    password?: string;
    specialization?: string;
    department?: string;
    consultationFee?: number;
  } = {},
): Promise<{ id: string; user: { id: string; name: string; email: string } }> {
  return request('POST', '/admin/doctors', {
    name: opts.name ?? 'Dr. Test',
    email: opts.email ?? uniqueEmail('doctor'),
    password: opts.password ?? 'password123',
    specialization: opts.specialization ?? 'General Medicine',
    department: opts.department ?? 'OPD',
    consultationFee: opts.consultationFee ?? 500,
  }, adminToken);
}

export async function createPharmacyItem(
  adminToken: string,
  opts: { name: string; brand?: string; pricePerUnit?: number; costPricePerUnit?: number; stockUnits?: number },
): Promise<{ id: string; name: string }> {
  return request('POST', '/pharmacy/items', {
    name: opts.name,
    brand: opts.brand,
    pricePerUnit: opts.pricePerUnit ?? 5,
    costPricePerUnit: opts.costPricePerUnit ?? 3,
    stockUnits: opts.stockUnits ?? 50,
  }, adminToken);
}

// Every day of the week, all-day -- so a booking or walk-in test never fails
// just because it happened to run on a day the doctor "isn't available".
export async function giveDoctorFullWeekSchedule(adminToken: string, doctorId: string): Promise<void> {
  const slots = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startTime: '00:00',
    endTime: '23:59',
  }));
  await request('PUT', `/admin/doctors/${doctorId}/schedule`, { slots }, adminToken);
}

export async function createStaff(
  adminToken: string,
  opts: {
    name?: string;
    email?: string;
    password?: string;
    role: 'PHARMACIST' | 'LAB_TECHNICIAN' | 'RADIOLOGY_TECHNICIAN' | 'RECEPTIONIST' | 'NURSE' | 'HEAD_NURSE';
  },
): Promise<{ id: string; email: string }> {
  return request('POST', '/admin/staff', {
    name: opts.name ?? `Test ${opts.role}`,
    email: opts.email ?? uniqueEmail(opts.role.toLowerCase()),
    password: opts.password ?? 'password123',
    role: opts.role,
  }, adminToken);
}

// Convenience: a clinic + admin + a fully-scheduled doctor, ready for
// booking/walk-in specs without each spec repeating this boilerplate.
export async function setupClinicWithDoctor(opts: { tier?: 1 | 2 | 3 } = {}) {
  const clinicSlug = uniqueSlug('clinic');
  const admin = await registerClinic({ clinicName: 'E2E Test Clinic', clinicSlug, tier: opts.tier });
  const doctor = await createDoctor(admin.token, { consultationFee: 500 });
  await giveDoctorFullWeekSchedule(admin.token, doctor.id);
  return { clinicSlug, admin, doctor };
}

export async function createWard(adminToken: string, name: string): Promise<{ id: string; beds: { id: string }[] }> {
  return request('POST', '/ipd/wards', { name }, adminToken);
}

export async function bulkAddBeds(
  adminToken: string,
  wardId: string,
  opts: { startNumber?: number; count?: number; dailyRate?: number } = {},
): Promise<{ id: string; beds: { id: string; status: string }[] }> {
  return request(
    'POST',
    `/ipd/wards/${wardId}/beds/bulk`,
    { startNumber: opts.startNumber ?? 1, count: opts.count ?? 5, dailyRate: opts.dailyRate ?? 1000 },
    adminToken,
  );
}

export async function admitPatient(
  adminToken: string,
  opts: { patientId: string; bedId: string; admittingDoctorId: string; reason?: string; depositAmount?: number },
): Promise<{ id: string }> {
  return request('POST', '/ipd/admissions', opts, adminToken);
}

export async function dischargeAdmission(adminToken: string, admissionId: string): Promise<void> {
  await request('POST', `/ipd/admissions/${admissionId}/discharge`, {}, adminToken);
}

// Convenience: a Tier-3 clinic with a doctor, a ward with a vacant bed, a
// patient, and that patient admitted -- everything a Nurse/Head-Nurse
// role-visibility spec needs, without repeating the IPD setup chain.
export async function setupAdmittedPatient() {
  const clinicSlug = uniqueSlug('clinic-ipd');
  const admin = await registerClinic({ clinicName: 'E2E IPD Clinic', clinicSlug, tier: 3 });
  const doctor = await createDoctor(admin.token, { consultationFee: 500 });
  await giveDoctorFullWeekSchedule(admin.token, doctor.id);
  const patientSession = await registerPatient({ clinicSlug });
  const ward = await createWard(admin.token, 'General Ward');
  const withBeds = await bulkAddBeds(admin.token, ward.id, { count: 2, dailyRate: 1000 });
  const admission = await admitPatient(admin.token, {
    patientId: patientSession.user.id,
    bedId: withBeds.beds[0].id,
    admittingDoctorId: doctor.id,
    depositAmount: 500,
  });
  return { clinicSlug, admin, doctor, patientSession, admission };
}
