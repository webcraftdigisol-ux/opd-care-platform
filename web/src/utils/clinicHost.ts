import { useQuery } from '@tanstack/react-query';
import { fetchClinicBySlug } from '../api/clinics';

// Each clinic has its own address: <clinic code>.<VITE_CLINIC_DOMAIN>, e.g.
// anandi.ohmscare.in. There the sign-in pages already know the clinic and
// don't ask for its code; on the shared app.ohmscare.in they still do.
const PLATFORM_HOSTS = new Set(['app', 'api', 'www']);

export function clinicCodeFromHost(hostname: string, domain: string | undefined = import.meta.env.VITE_CLINIC_DOMAIN): string | null {
  if (!domain) return null;
  const host = hostname.toLowerCase();
  const suffix = `.${domain.toLowerCase()}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label) || PLATFORM_HOSTS.has(label)) return null;
  return label;
}

export const hostClinicCode = () => clinicCodeFromHost(window.location.hostname);

// The clinic this address belongs to, if it's a clinic's own address.
export function useHostClinic() {
  const code = hostClinicCode();
  const q = useQuery({
    queryKey: ['host-clinic', code],
    queryFn: () => fetchClinicBySlug(code!),
    enabled: !!code,
    retry: false,
    staleTime: Infinity,
  });
  return { code, clinic: q.data, notFound: !!code && q.isError };
}
