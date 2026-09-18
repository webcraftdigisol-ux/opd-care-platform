import { apiClient } from './client';
import type {
  AddChargeRequest,
  AddDoctorVisitRequest,
  AddMedicationRequest,
  AddProcedureRequest,
  AddVitalsRequest,
  Admission,
  AdmissionDetail,
  AdmissionStatus,
  AdmitPatientRequest,
  Bed,
  BulkAddBedsRequest,
  ChargeRecord,
  CreateWardRequest,
  DischargeRequest,
  DoctorVisitRecord,
  IpdBill,
  MedicationRecord,
  ProcedureRecord,
  TransferRoomRequest,
  VitalsRecord,
  Ward,
} from '@opd/shared';

export type IpdBillPreview = Omit<IpdBill, 'id' | 'createdAt'>;

export async function listWards(): Promise<Ward[]> {
  const res = await apiClient.get<Ward[]>('/ipd/wards');
  return res.data;
}

export async function createWard(data: CreateWardRequest): Promise<Ward> {
  const res = await apiClient.post<Ward>('/ipd/wards', data);
  return res.data;
}

export async function bulkAddBeds(wardId: string, data: BulkAddBedsRequest): Promise<Ward> {
  const res = await apiClient.post<Ward>(`/ipd/wards/${wardId}/beds/bulk`, data);
  return res.data;
}

export async function updateBed(bedId: string, data: Partial<{ dailyRate: number; status: Bed['status'] }>): Promise<Bed> {
  const res = await apiClient.put<Bed>(`/ipd/beds/${bedId}`, data);
  return res.data;
}

export async function listVacantBeds(): Promise<Bed[]> {
  const res = await apiClient.get<Bed[]>('/ipd/beds/vacant');
  return res.data;
}

export async function admitPatient(data: AdmitPatientRequest): Promise<AdmissionDetail> {
  const res = await apiClient.post<AdmissionDetail>('/ipd/admissions', data);
  return res.data;
}

export async function listAdmissions(status?: AdmissionStatus): Promise<Admission[]> {
  const res = await apiClient.get<Admission[]>('/ipd/admissions', { params: { status } });
  return res.data;
}

export async function getAdmission(id: string): Promise<AdmissionDetail> {
  const res = await apiClient.get<AdmissionDetail>(`/ipd/admissions/${id}`);
  return res.data;
}

export async function transferRoom(admissionId: string, data: TransferRoomRequest): Promise<AdmissionDetail> {
  const res = await apiClient.post<AdmissionDetail>(`/ipd/admissions/${admissionId}/transfer`, data);
  return res.data;
}

export async function addDoctorVisit(admissionId: string, data: AddDoctorVisitRequest): Promise<DoctorVisitRecord> {
  const res = await apiClient.post<DoctorVisitRecord>(`/ipd/admissions/${admissionId}/doctor-visits`, data);
  return res.data;
}

export async function addProcedure(admissionId: string, data: AddProcedureRequest): Promise<ProcedureRecord> {
  const res = await apiClient.post<ProcedureRecord>(`/ipd/admissions/${admissionId}/procedures`, data);
  return res.data;
}

export async function addMedication(admissionId: string, data: AddMedicationRequest): Promise<MedicationRecord> {
  const res = await apiClient.post<MedicationRecord>(`/ipd/admissions/${admissionId}/medications`, data);
  return res.data;
}

export async function addVitals(admissionId: string, data: AddVitalsRequest): Promise<VitalsRecord> {
  const res = await apiClient.post<VitalsRecord>(`/ipd/admissions/${admissionId}/vitals`, data);
  return res.data;
}

export async function addCharge(admissionId: string, data: AddChargeRequest): Promise<ChargeRecord> {
  const res = await apiClient.post<ChargeRecord>(`/ipd/admissions/${admissionId}/charges`, data);
  return res.data;
}

export async function getBillPreview(admissionId: string): Promise<IpdBillPreview> {
  const res = await apiClient.get<IpdBillPreview>(`/ipd/admissions/${admissionId}/bill-preview`);
  return res.data;
}

export async function dischargePatient(admissionId: string, data: DischargeRequest): Promise<AdmissionDetail> {
  const res = await apiClient.post<AdmissionDetail>(`/ipd/admissions/${admissionId}/discharge`, data);
  return res.data;
}
