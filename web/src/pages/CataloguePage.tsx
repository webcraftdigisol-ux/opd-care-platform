import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogKind, DoctorCatalogItem } from '@opd/shared';
import { addCatalogItem, addStarterCatalogue, deleteCatalogItem, listCatalogue, updateCatalogItem } from '../api/catalogue';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';

const TABS: { kind: CatalogKind; label: string; icon: IconName; placeholder: string }[] = [
  { kind: 'MEDICINE', label: 'Medicines', icon: 'pill', placeholder: 'e.g. Paracetamol' },
  { kind: 'LAB_TEST', label: 'Lab tests', icon: 'flask', placeholder: 'e.g. CBC, Blood Sugar' },
  { kind: 'RADIOLOGY', label: 'Radiology', icon: 'scan', placeholder: 'e.g. Chest X-Ray, MRI Brain' },
];

// The Doctor's Catalogue: the lists the consultation screen suggests from
// as the doctor types. Every tier has it; Tier 2+ clinics also get their
// department catalogues suggested alongside.
export function CataloguePage() {
  const { clinic } = useAuth();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<CatalogKind>('MEDICINE');
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const tab = TABS.find((t) => t.kind === kind)!;

  const { data: items } = useQuery({ queryKey: ['catalogue'], queryFn: () => listCatalogue() });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['catalogue'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-suggestions'] });
  };

  const add = useMutation({
    mutationFn: () => addCatalogItem({ kind, name, strength: kind === 'MEDICINE' ? strength : null }),
    onSuccess: () => {
      setName('');
      setStrength('');
      setError(null);
      refresh();
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not add'),
  });
  const starter = useMutation({
    mutationFn: addStarterCatalogue,
    onSuccess: ({ added }) => {
      setInfo(added ? `Added ${added} common items.` : 'The common items are already in your catalogue.');
      refresh();
    },
  });

  const counts = Object.fromEntries(TABS.map((t) => [t.kind, items?.filter((i) => i.kind === t.kind).length ?? 0]));
  const shown = (items ?? []).filter(
    (i) => i.kind === kind && `${i.name} ${i.strength ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Doctor's Catalogue"
        subtitle={
          (clinic?.tier ?? 1) >= 2
            ? 'Name lists the consultation screen suggests as you type. Your pharmacy, lab and radiology catalogues are suggested too.'
            : 'Name lists the consultation screen suggests as you type — medicines, lab tests and radiology work.'
        }
        actions={
          <button type="button" onClick={() => starter.mutate()} disabled={starter.isPending} className={btnSecondary}>
            Add common items
          </button>
        }
      />
      {info && <p className="mb-4 rounded-lg bg-teal-light p-3 text-sm text-teal">{info}</p>}

      <div className="mb-4 flex gap-1 border-b border-gray-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.kind}
            role="tab"
            aria-selected={kind === t.kind}
            onClick={() => {
              setKind(t.kind);
              setError(null);
            }}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${
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
          className="flex flex-wrap gap-2"
        >
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tab.placeholder}
            aria-label="Name"
            className={`${inputClass} !w-auto min-w-[12rem] flex-1`}
            data-testid="catalogue-name"
          />
          {kind === 'MEDICINE' && (
            <input
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
              placeholder="Strength, e.g. 650 mg"
              aria-label="Strength"
              className={`${inputClass} !w-44`}
              data-testid="catalogue-strength"
            />
          )}
          <button type="submit" disabled={add.isPending} className={btnPrimary}>
            <Icon name="plus" className="h-4 w-4" /> Add
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {(counts[kind] ?? 0) > 8 && (
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className={`${inputClass} mt-4`} />
        )}
        <ul className="mt-4 divide-y divide-gray-100" data-testid="catalogue-list">
          {shown.map((item) => (
            <CatalogueRow key={item.id} item={item} icon={tab.icon} onChanged={refresh} />
          ))}
          {shown.length === 0 && (
            <li className="py-6 text-center text-sm text-gray-500">
              {filter ? 'Nothing matches.' : `No ${tab.label.toLowerCase()} yet. Add them above, or use “Add common items”.`}
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function CatalogueRow({ item, icon, onChanged }: { item: DoctorCatalogItem; icon: IconName; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [strength, setStrength] = useState(item.strength ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => updateCatalogItem(item.id, { name, strength }),
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
      <li className="py-2">
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} !w-auto flex-1 py-1.5`} aria-label="Name" />
          {item.kind === 'MEDICINE' && (
            <input value={strength} onChange={(e) => setStrength(e.target.value)} className={`${inputClass} !w-36 py-1.5`} aria-label="Strength" />
          )}
          <button type="button" onClick={() => save.mutate()} className="text-sm font-medium text-teal">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-gray-500">
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 py-2.5">
      <Icon name={icon} className="h-4 w-4 text-gray-400" />
      <span className="flex-1 text-sm text-gray-900">
        {item.name}
        {item.strength && <span className="ml-2 text-gray-500">{item.strength}</span>}
      </span>
      <button type="button" onClick={() => setEditing(true)} className="text-sm text-gray-500 hover:text-teal" aria-label={`Edit ${item.name}`}>
        <Icon name="edit" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => remove.mutate()}
        className="text-sm text-gray-400 hover:text-red-600"
        aria-label={`Delete ${item.name}${item.strength ? ` ${item.strength}` : ''}`}
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </li>
  );
}
