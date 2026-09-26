import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogKind, DoctorCatalogItem } from '@opd/shared';
import { addCatalogItem, addStarterCatalogue, deleteCatalogItem, listCatalogue, updateCatalogItem } from '../api/catalogue';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { BrandsInput } from '../components/BrandsInput';
import { medicineSystemLabel } from '../utils/medicineSystem';

const TABS: { kind: CatalogKind; label: string; icon: IconName; placeholder: string }[] = [
  { kind: 'MEDICINE', label: 'Medicines', icon: 'pill', placeholder: 'Generic name, e.g. Paracetamol' },
  { kind: 'LAB_TEST', label: 'Lab tests', icon: 'flask', placeholder: 'e.g. CBC, Blood Sugar' },
  { kind: 'RADIOLOGY', label: 'Radiology', icon: 'scan', placeholder: 'e.g. Chest X-Ray, MRI Brain' },
];

const PAGE = 50;

// The Doctor's Catalogue: the lists the consultation screen suggests from
// as the doctor types -- medicines with strength and brands, lab tests and
// radiology work. Every tier has it; Tier 2+ clinics also get their
// department catalogues suggested alongside.
export function CataloguePage() {
  const { clinic } = useAuth();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CatalogKind>('MEDICINE');
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const tab = TABS.find((t) => t.kind === kind)!;
  const isMedicine = kind === 'MEDICINE';

  const { data: items } = useQuery({ queryKey: ['catalogue'], queryFn: () => listCatalogue() });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['catalogue'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-suggestions'] });
  };

  const add = useMutation({
    mutationFn: () => addCatalogItem({ kind, name, strength: isMedicine ? strength : null, brands: isMedicine ? brands : undefined }),
    onSuccess: () => {
      setName('');
      setStrength('');
      setBrands([]);
      setError(null);
      refresh();
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not add'),
  });
  const starter = useMutation({
    mutationFn: addStarterCatalogue,
    onSuccess: ({ added, brandsAdded }: { added: number; brandsAdded?: number }) => {
      const parts = [added && `${added} items`, brandsAdded && `${brandsAdded} brands to medicines you already had`].filter(Boolean);
      setInfo(parts.length ? `Added ${parts.join(' and ')}.` : 'The common items are already in your catalogue.');
      refresh();
    },
  });

  const counts = Object.fromEntries(TABS.map((t) => [t.kind, items?.filter((i) => i.kind === t.kind).length ?? 0]));
  const q = filter.trim().toLowerCase();
  const matching = (items ?? []).filter(
    (i) => i.kind === kind && `${i.name} ${i.strength ?? ''} ${i.brands.join(' ')}`.toLowerCase().includes(q),
  );
  const shown = matching.slice(0, limit);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Doctor's Catalogue"
        subtitle={
          (clinic?.tier ?? 1) >= 2
            ? 'Name lists the consultation screen suggests as you type. Your pharmacy, lab and radiology catalogues are suggested too.'
            : 'Name lists the consultation screen suggests as you type — medicines with their brands, lab tests and radiology work.'
        }
        actions={
          <button type="button" onClick={() => starter.mutate()} disabled={starter.isPending} className={btnSecondary} data-testid="add-common">
            {starter.isPending ? 'Adding…' : `Add common items (${medicineSystemLabel(clinic?.medicineSystem)})`}
          </button>
        }
      />
      {info && <p className="mb-4 rounded-lg bg-teal-light p-3 text-sm text-teal">{info}</p>}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.kind}
            role="tab"
            aria-selected={kind === t.kind}
            onClick={() => {
              setKind(t.kind);
              setError(null);
              setLimit(PAGE);
            }}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${
              kind === t.kind ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Icon name={t.icon} className="h-4 w-4" /> {t.label}
            <span className="rounded-full bg-gray-100 px-1.5 text-xs text-gray-600">{counts[t.kind]}</span>
          </button>
        ))}
      </div>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
          className={`grid gap-2 ${isMedicine ? 'sm:grid-cols-[1.4fr_0.8fr_1.6fr_auto]' : 'sm:grid-cols-[1fr_auto]'}`}
        >
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={tab.placeholder} aria-label="Name" className={inputClass} data-testid="catalogue-name" />
          {isMedicine && (
            <>
              <input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="Strength, e.g. 650 mg" aria-label="Strength" className={inputClass} data-testid="catalogue-strength" />
              <BrandsInput value={brands} onChange={setBrands} testId="catalogue-brands" />
            </>
          )}
          <button type="submit" disabled={add.isPending} className={btnPrimary}>
            <Icon name="plus" className="h-4 w-4" /> Add
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {(counts[kind] ?? 0) > 8 && (
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLimit(PAGE);
            }}
            placeholder={isMedicine ? 'Filter by medicine, strength or brand…' : 'Filter…'}
            className={`${inputClass} mt-4`}
            data-testid="catalogue-filter"
          />
        )}

        {isMedicine && shown.length > 0 && (
          <div className="mt-4 hidden grid-cols-[1.4fr_0.8fr_1.6fr_4rem] gap-3 border-b border-gray-100 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-gray-400 sm:grid">
            <span>Medicine</span>
            <span>Strength</span>
            <span>Brands</span>
            <span />
          </div>
        )}
        <ul className={`divide-y divide-gray-100 ${isMedicine ? '' : 'mt-4'}`} data-testid="catalogue-list">
          {shown.map((item) => (
            <CatalogueRow key={item.id} item={item} icon={tab.icon} onChanged={refresh} />
          ))}
          {shown.length === 0 && (
            <li className="py-6 text-center text-sm text-gray-500">
              {filter ? 'Nothing matches.' : `No ${tab.label.toLowerCase()} yet. Add them above, or use “Add common items”.`}
            </li>
          )}
        </ul>
        {matching.length > shown.length && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-3 text-sm font-medium text-teal hover:underline">
            Show more ({matching.length - shown.length} more)
          </button>
        )}
      </Card>
    </div>
  );
}

function CatalogueRow({ item, icon, onChanged }: { item: DoctorCatalogItem; icon: IconName; onChanged: () => void }) {
  const isMedicine = item.kind === 'MEDICINE';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [strength, setStrength] = useState(item.strength ?? '');
  const [brands, setBrands] = useState(item.brands);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => updateCatalogItem(item.id, { name, strength, ...(isMedicine ? { brands } : {}) }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      onChanged();
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not save'),
  });
  const remove = useMutation({ mutationFn: () => deleteCatalogItem(item.id), onSuccess: onChanged });

  if (editing) {
    return (
      <li className="py-2" data-testid="catalogue-row-editing">
        <div className={`grid gap-2 ${isMedicine ? 'sm:grid-cols-[1.4fr_0.8fr_1.6fr_auto]' : 'sm:grid-cols-[1fr_auto]'}`}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} py-1.5`} aria-label="Name" />
          {isMedicine && (
            <>
              <input value={strength} onChange={(e) => setStrength(e.target.value)} className={`${inputClass} py-1.5`} aria-label="Strength" />
              <BrandsInput value={brands} onChange={setBrands} testId="edit-brands" />
            </>
          )}
          <span className="flex items-center gap-3">
            <button type="button" onClick={() => save.mutate()} className="text-sm font-medium text-teal">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setBrands(item.brands);
              }}
              className="text-sm text-gray-500"
            >
              Cancel
            </button>
          </span>
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </li>
    );
  }
  const actions = (
    <span className="flex items-center justify-end gap-2">
      <button type="button" onClick={() => setEditing(true)} className="text-gray-500 hover:text-teal" aria-label={`Edit ${item.name}`}>
        <Icon name="edit" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => remove.mutate()}
        className="text-gray-400 hover:text-red-600"
        aria-label={`Delete ${item.name}${item.strength ? ` ${item.strength}` : ''}`}
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </span>
  );
  if (!isMedicine) {
    return (
      <li className="flex items-center gap-3 py-2.5">
        <Icon name={icon} className="h-4 w-4 text-gray-400" />
        <span className="flex-1 text-sm text-gray-900">{item.name}</span>
        {actions}
      </li>
    );
  }
  return (
    <li className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 px-1 py-2.5 sm:grid-cols-[1.4fr_0.8fr_1.6fr_4rem]" data-testid="catalogue-row">
      <span className="text-sm font-medium text-gray-900">{item.name}</span>
      <span className="order-3 text-sm text-gray-500 sm:order-none">{item.strength}</span>
      <span className="order-4 col-span-2 flex flex-wrap gap-1 sm:order-none sm:col-span-1">
        {item.brands.length ? (
          item.brands.map((b) => (
            <span key={b} className="rounded bg-gold-light px-1.5 py-0.5 text-xs text-gray-700">
              {b}
            </span>
          ))
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-teal">
            + Add brands
          </button>
        )}
      </span>
      {actions}
    </li>
  );
}
