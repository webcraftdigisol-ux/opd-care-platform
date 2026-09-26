import { useHostClinic } from '../utils/clinicHost';

// The "Clinic code" box on the sign-in, sign-up and password-reset pages --
// or, on a clinic's own address, just the clinic's name (the code comes
// from the address; see utils/clinicHost.ts).
export function ClinicCodeField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const { code, clinic, notFound } = useHostClinic();
  if (code) {
    return notFound ? (
      <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="host-clinic-not-found">
        There's no clinic at this address. Check the link, or sign in at the main site with your clinic code.
      </p>
    ) : (
      <p className="rounded-md bg-teal-light px-3 py-2 text-sm text-teal" data-testid="host-clinic">
        <span className="font-semibold">{clinic?.name ?? code}</span>
      </p>
    );
  }
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">Clinic code</label>
      <input required placeholder="e.g. sunrise-clinic" value={value} onChange={(e) => onChange(e.target.value)} className={className} />
    </div>
  );
}
