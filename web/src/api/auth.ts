import { apiClient } from './client';
import type {
  AuthResponse,
  LoginRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PublicUser,
  RegisterRequest,
} from '@opd/shared';

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

export async function updateWhatsAppOptIn(whatsappOptIn: boolean): Promise<PublicUser> {
  const res = await apiClient.put<PublicUser>('/auth/me/whatsapp-optin', { whatsappOptIn });
  return res.data;
}

export async function requestPasswordReset(data: PasswordResetRequest): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/password-reset/request', data);
  return res.data;
}

export async function confirmPasswordReset(data: PasswordResetConfirmRequest): Promise<{ message: string }> {
  const res = await apiClient.post<{ message: string }>('/auth/password-reset/confirm', data);
  return res.data;
}

export async function getPasswordResetStatus(): Promise<{ available: boolean }> {
  const res = await apiClient.get<{ available: boolean }>('/auth/password-reset/status');
  return res.data;
}
