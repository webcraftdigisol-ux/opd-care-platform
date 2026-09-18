import { apiClient } from './client';
import type { AuthResponse, LoginRequest, PublicUser, RegisterRequest } from '@opd/shared';

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/auth/login', data);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/auth/register', data);
  return res.data;
}

export async function fetchMe(): Promise<PublicUser> {
  const res = await apiClient.get<PublicUser>('/auth/me');
  return res.data;
}
