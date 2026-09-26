import { useNavigate } from 'react-router-dom';
import { btnPrimary } from './ui';

// A printable A4 page: a Back / Print bar (hidden when printing) above the
// sheet, with the clinic's letterhead at the top.
export function PrintFrame({
  clinic,
  title,
  children,
  testId,
}: {
  clinic: { name: string; address: string | null; phone: string | null };
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center gap-2 px-4 print:hidden">
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : window.close())} className="mr-auto text-sm text-gray-600 hover:text-teal">
          ← Back
        </button>
        <button type="button" onClick={() => window.print()} className={btnPrimary}>
          Print
        </button>
      </div>
      <article className="mx-auto min-h-[270mm] max-w-[210mm] bg-white p-10 text-gray-900 shadow-sm print:min-h-0 print:max-w-none print:p-0 print:shadow-none" data-testid={testId}>
        <header className="border-b-2 border-teal pb-3 text-center">
          <h1 className="text-2xl font-bold">{clinic.name}</h1>
          {(clinic.address || clinic.phone) && (
            <p className="text-xs text-gray-600">{[clinic.address, clinic.phone && `Ph: ${clinic.phone}`].filter(Boolean).join(' · ')}</p>
          )}
        </header>
        <h2 className="mt-5 text-center text-lg font-bold uppercase tracking-wide text-teal">{title}</h2>
        {children}
      </article>
    </div>
  );
}

// A signature line with a caption under it.
export function SignatureLine({ label, name }: { label: string; name?: string | null }) {
  return (
    <div className="text-sm">
      <div className="h-12 border-b border-gray-400" />
      <p className="mt-1 font-medium">{label}</p>
      {name && <p className="text-gray-600">{name}</p>}
    </div>
  );
}
