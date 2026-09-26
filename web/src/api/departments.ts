import { apiClient } from './client';
import type {
  Department,
  DeptQueueEntry,
  LabInvoice,
  LabTestCatalogEntry,
  PharmacyPatientOrders,
  PharmacySale,
  Receipt,
  TestPatientOrders,
} from '@opd/shared';

// The Tier 2 department counters. Lab and radiology share one API shape.
export type TestDept = 'lab' | 'radiology';
export const DEPT_PATH: Record<Department, 'pharmacy' | TestDept> = { PHARMACY: 'pharmacy', LAB: 'lab', RADIOLOGY: 'radiology' };

export async function getQueue(dept: Department): Promise<DeptQueueEntry[]> {
  return (await apiClient.get<DeptQueueEntry[]>(`/${DEPT_PATH[dept]}/queue`)).data;
}

export async function getReceipt(dept: Department, billId: string): Promise<Receipt> {
  return (await apiClient.get<Receipt>(`/receipts/${DEPT_PATH[dept]}/${billId}`)).data;
}

// ---- Pharmacy ----

export async function getPharmacyOrders(patientId: string): Promise<PharmacyPatientOrders> {
  return (await apiClient.get<PharmacyPatientOrders>(`/pharmacy/patients/${patientId}/orders`)).data;
}

export async function skipPrescription(id: string, reason: string): Promise<void> {
  await apiClient.post(`/pharmacy/prescriptions/${id}/skip`, { reason });
}

export async function unskipPrescription(id: string): Promise<void> {
  await apiClient.delete(`/pharmacy/prescriptions/${id}/skip`);
}

export async function listRecentSales(): Promise<PharmacySale[]> {
  return (await apiClient.get<PharmacySale[]>('/pharmacy/sales')).data;
}

export async function addStarterMedicines(): Promise<{ added: number }> {
  return (await apiClient.post<{ added: number }>('/pharmacy/items/starter')).data;
}

// ---- Lab / radiology ----

export async function getTestOrders(dept: TestDept, patientId: string): Promise<TestPatientOrders> {
  return (await apiClient.get<TestPatientOrders>(`/${dept}/patients/${patientId}/orders`)).data;
}

export async function skipTestOrder(dept: TestDept, id: string, reason: string): Promise<void> {
  await apiClient.post(`/${dept}/orders/${id}/skip`, { reason });
}

export async function unskipTestOrder(dept: TestDept, id: string): Promise<void> {
  await apiClient.delete(`/${dept}/orders/${id}/skip`);
}

export async function saveTestResult(dept: TestDept, itemId: string, resultText: string): Promise<void> {
  await apiClient.patch(`/${dept}/results/${itemId}`, { resultText });
}

export async function listTestCatalog(dept: TestDept): Promise<LabTestCatalogEntry[]> {
  return (await apiClient.get<LabTestCatalogEntry[]>(`/${dept}/catalog`)).data;
}

export async function createTestCatalogEntry(dept: TestDept, data: { name: string; price: number; cost?: number }): Promise<LabTestCatalogEntry> {
  return (await apiClient.post<LabTestCatalogEntry>(`/${dept}/catalog`, data)).data;
}

export async function updateTestCatalogEntry(dept: TestDept, id: string, data: { name?: string; price?: number; cost?: number }): Promise<LabTestCatalogEntry> {
  return (await apiClient.put<LabTestCatalogEntry>(`/${dept}/catalog/${id}`, data)).data;
}

export async function deleteTestCatalogEntry(dept: TestDept, id: string): Promise<void> {
  await apiClient.delete(`/${dept}/catalog/${id}`);
}

export async function addStarterTests(dept: TestDept): Promise<{ added: number }> {
  return (await apiClient.post<{ added: number }>(`/${dept}/catalog/starter`)).data;
}

export async function createTestInvoice(
  dept: TestDept,
  data: { patientId: string; items: { orderId?: string; catalogItemId?: string; testName: string; price: number }[] },
): Promise<LabInvoice> {
  return (await apiClient.post<LabInvoice>(`/${dept}/invoices`, data)).data;
}

export async function listRecentInvoices(dept: TestDept): Promise<LabInvoice[]> {
  return (await apiClient.get<LabInvoice[]>(`/${dept}/invoices`)).data;
}
