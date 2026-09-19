import { platformClient } from './platformClient';
import type {
  ClinicWithSubscription,
  PlatformAdminAuthResponse,
  RenewSubscriptionRequest,
  Subscription,
  SubscriptionPayment,
} from '@opd/shared';

export async function platformLogin(email: string, password: string): Promise<PlatformAdminAuthResponse> {
  const res = await platformClient.post<PlatformAdminAuthResponse>('/platform/login', { email, password });
  return res.data;
}

export async function listClinicsWithSubscriptions(): Promise<ClinicWithSubscription[]> {
  const res = await platformClient.get<ClinicWithSubscription[]>('/platform/clinics');
  return res.data;
}

export async function listSubscriptionPayments(clinicId: string): Promise<SubscriptionPayment[]> {
  const res = await platformClient.get<SubscriptionPayment[]>(`/platform/clinics/${clinicId}/subscription/payments`);
  return res.data;
}

export async function renewSubscription(clinicId: string, data: RenewSubscriptionRequest): Promise<Subscription> {
  const res = await platformClient.post<Subscription>(`/platform/clinics/${clinicId}/subscription/renew`, data);
  return res.data;
}

export async function suspendSubscription(clinicId: string): Promise<Subscription> {
  const res = await platformClient.post<Subscription>(`/platform/clinics/${clinicId}/subscription/suspend`);
  return res.data;
}

export async function reactivateSubscription(clinicId: string): Promise<Subscription> {
  const res = await platformClient.post<Subscription>(`/platform/clinics/${clinicId}/subscription/reactivate`);
  return res.data;
}
