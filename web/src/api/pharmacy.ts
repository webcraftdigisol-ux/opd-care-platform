import { apiClient } from './client';
import type {
  CreatePharmacySaleRequest,
  PendingPharmacyLine,
  PharmacyItem,
  PharmacySale,
  UpsertPharmacyItemRequest,
} from '@opd/shared';

export async function listPharmacyItems(): Promise<PharmacyItem[]> {
  const res = await apiClient.get<PharmacyItem[]>('/pharmacy/items');
  return res.data;
}

export async function createPharmacyItem(data: UpsertPharmacyItemRequest): Promise<PharmacyItem> {
  const res = await apiClient.post<PharmacyItem>('/pharmacy/items', data);
  return res.data;
}

export async function updatePharmacyItem(
  id: string,
  data: Partial<UpsertPharmacyItemRequest>,
): Promise<PharmacyItem> {
  const res = await apiClient.put<PharmacyItem>(`/pharmacy/items/${id}`, data);
  return res.data;
}

export async function deletePharmacyItem(id: string): Promise<void> {
  await apiClient.delete(`/pharmacy/items/${id}`);
}

export async function getPendingPharmacyLines(patientId: string): Promise<PendingPharmacyLine[]> {
  const res = await apiClient.get<PendingPharmacyLine[]>(`/pharmacy/patients/${patientId}/pending`);
  return res.data;
}

export async function createPharmacySale(data: CreatePharmacySaleRequest): Promise<PharmacySale> {
  const res = await apiClient.post<PharmacySale>('/pharmacy/sales', data);
  return res.data;
}
