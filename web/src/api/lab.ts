import { apiClient } from './client';
import type {
  CreateLabInvoiceRequest,
  LabInvoice,
  LabTestCatalogEntry,
  PendingLabLine,
  UpsertLabTestCatalogRequest,
} from '@opd/shared';

export async function listLabCatalog(): Promise<LabTestCatalogEntry[]> {
  const res = await apiClient.get<LabTestCatalogEntry[]>('/lab/catalog');
  return res.data;
}

export async function createLabCatalogEntry(data: UpsertLabTestCatalogRequest): Promise<LabTestCatalogEntry> {
  const res = await apiClient.post<LabTestCatalogEntry>('/lab/catalog', data);
  return res.data;
}

export async function updateLabCatalogEntry(
  id: string,
  data: Partial<UpsertLabTestCatalogRequest>,
): Promise<LabTestCatalogEntry> {
  const res = await apiClient.put<LabTestCatalogEntry>(`/lab/catalog/${id}`, data);
  return res.data;
}

export async function deleteLabCatalogEntry(id: string): Promise<void> {
  await apiClient.delete(`/lab/catalog/${id}`);
}

export async function getPendingLabLines(patientId: string): Promise<PendingLabLine[]> {
  const res = await apiClient.get<PendingLabLine[]>(`/lab/patients/${patientId}/pending`);
  return res.data;
}

export async function createLabInvoice(data: CreateLabInvoiceRequest): Promise<LabInvoice> {
  const res = await apiClient.post<LabInvoice>('/lab/invoices', data);
  return res.data;
}
