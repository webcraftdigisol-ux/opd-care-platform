import { apiClient } from './client';
import type {
  CreateRadiologyInvoiceRequest,
  PendingRadiologyLine,
  RadiologyInvoice,
  RadiologyTestCatalogEntry,
  UpsertRadiologyTestCatalogRequest,
} from '@opd/shared';

export async function listRadiologyCatalog(): Promise<RadiologyTestCatalogEntry[]> {
  const res = await apiClient.get<RadiologyTestCatalogEntry[]>('/radiology/catalog');
  return res.data;
}

export async function createRadiologyCatalogEntry(
  data: UpsertRadiologyTestCatalogRequest,
): Promise<RadiologyTestCatalogEntry> {
  const res = await apiClient.post<RadiologyTestCatalogEntry>('/radiology/catalog', data);
  return res.data;
}

export async function updateRadiologyCatalogEntry(
  id: string,
  data: Partial<UpsertRadiologyTestCatalogRequest>,
): Promise<RadiologyTestCatalogEntry> {
  const res = await apiClient.put<RadiologyTestCatalogEntry>(`/radiology/catalog/${id}`, data);
  return res.data;
}

export async function deleteRadiologyCatalogEntry(id: string): Promise<void> {
  await apiClient.delete(`/radiology/catalog/${id}`);
}

export async function getPendingRadiologyLines(patientId: string): Promise<PendingRadiologyLine[]> {
  const res = await apiClient.get<PendingRadiologyLine[]>(`/radiology/patients/${patientId}/pending`);
  return res.data;
}

export async function createRadiologyInvoice(data: CreateRadiologyInvoiceRequest): Promise<RadiologyInvoice> {
  const res = await apiClient.post<RadiologyInvoice>('/radiology/invoices', data);
  return res.data;
}
