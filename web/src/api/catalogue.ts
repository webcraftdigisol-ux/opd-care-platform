import { apiClient } from './client';
import type { CatalogKind, CatalogSuggestions, DoctorCatalogItem, UpsertCatalogItemRequest } from '@opd/shared';

export async function listCatalogue(kind?: CatalogKind): Promise<DoctorCatalogItem[]> {
  const res = await apiClient.get<DoctorCatalogItem[]>('/catalogue', { params: { kind } });
  return res.data;
}

export async function getCatalogSuggestions(): Promise<CatalogSuggestions> {
  const res = await apiClient.get<CatalogSuggestions>('/catalogue/suggestions');
  return res.data;
}

export async function addCatalogItem(data: UpsertCatalogItemRequest): Promise<DoctorCatalogItem> {
  const res = await apiClient.post<DoctorCatalogItem>('/catalogue', data);
  return res.data;
}

export async function updateCatalogItem(id: string, data: { name: string; strength?: string | null }): Promise<DoctorCatalogItem> {
  const res = await apiClient.put<DoctorCatalogItem>(`/catalogue/${id}`, data);
  return res.data;
}

export async function deleteCatalogItem(id: string): Promise<void> {
  await apiClient.delete(`/catalogue/${id}`);
}

export async function addStarterCatalogue(): Promise<{ added: number }> {
  const res = await apiClient.post<{ added: number }>('/catalogue/starter');
  return res.data;
}
