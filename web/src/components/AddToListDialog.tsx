import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddToListResult, CatalogKind } from '@opd/shared';
import { addToList } from '../api/catalogue';
import { Field, Modal, btnPrimary, btnSecondary, inputClass } from './ui';

export const LIST_NAME: Record<CatalogKind, string> = { MEDICINE: 'pharmacy list', LAB_TEST: 'lab test list', RADIOLOGY: 'radiology list' };

// The window a doctor gets when a medicine or test isn't in the list: the
// details go straight into the pharmacy's / lab's / radiology's list (Tier
// 2+) or the Doctor's Catalogue (Tier 1), so it can be billed and is
// suggested from then on. The department sets the price later if the
// doctor doesn't know it.
export function AddToListDialog({
  kind,
  departments,
  initial,
  onAdded,
  onClose,
}: {
  kind: CatalogKind;
  // Tier 2+: the departments' lists; otherwise the doctor's catalogue.
  departments: boolean;
  initial: { name: string; strength?: string | null; brand?: string | null };
  onAdded: (r: AddToListResult) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial.name.trim());
  const [strength, setStrength] = useState(initial.strength ?? '');
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [price, setPrice] = useState('');
  const medicine = kind === 'MEDICINE';
  const listName = departments ? `the ${LIST_NAME[kind]}` : 'your catalogue';
  const add = useMutation({
    mutationFn: () =>
      addToList({
        kind,
        name: name.trim(),
        strength: medicine ? strength.trim() || null : null,
        brand: medicine ? brand.trim() || null : null,
        price: departments && price.trim() ? Number(price) : undefined,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['catalog-suggestions'] });
      onAdded(r);
    },
  });

  return (
    <Modal title={`Add to ${listName}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="space-y-3"
        data-testid="add-to-list-dialog"
      >
        <p className="text-sm text-gray-600">
          {departments
            ? `It will be added to ${listName} for billing, and suggested when anyone types it from now on.`
            : 'It will be suggested when you type it from now on.'}
        </p>
        <Field label={medicine ? 'Medicine (generic name)' : 'Test name'} required>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} data-testid="add-to-list-name" />
        </Field>
        {medicine && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Strength / pack" hint="e.g. 500 mg, 30C, 100 g">
              <input value={strength} onChange={(e) => setStrength(e.target.value)} className={inputClass} data-testid="add-to-list-strength" />
            </Field>
            <Field label="Brand">
              <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} data-testid="add-to-list-brand" />
            </Field>
          </div>
        )}
        {departments && (
          <Field label={medicine ? 'MRP per unit (₹)' : 'Price (₹)'} hint="Optional — the department can set or correct it later">
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} data-testid="add-to-list-price" />
          </Field>
        )}
        {add.isError && <p className="text-sm text-red-600">{(add.error as any).response?.data?.message ?? 'Could not add'}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={add.isPending || !name.trim()} className={btnPrimary} data-testid="add-to-list-save">
            Add to list
          </button>
        </div>
      </form>
    </Modal>
  );
}
