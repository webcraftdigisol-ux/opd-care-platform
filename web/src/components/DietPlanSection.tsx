import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@opd/shared';
import { createDietPlan, listDietPlans, sendDietPlanWhatsApp } from '../api/dietplans';
import { DIET_TEMPLATES, dietTemplateText, suggestDietTemplates, type DietKind } from '../utils/dietTemplates';
import { Card, btnPrimary, inputClass } from './ui';

const KIND_LABEL: Record<string, string> = { VEG: 'Veg', NON_VEG: 'Non-veg', EGGETARIAN: 'Eggetarian', VEGAN: 'Vegan' };

// The diet to prescribe, on a consultation (OPD) or an admission (IPD):
// templates suited to the diagnosis / chief complaint in a veg or non-veg
// version fill the plan, which the doctor edits and saves; earlier plans
// below, each can be sent on WhatsApp.
export function DietPlanSection({
  patient,
  consultationId,
  admissionId,
  context,
}: {
  patient: PublicUser | undefined;
  consultationId?: string;
  admissionId?: string;
  // Diagnosis and chief complaint (or admission reason) the templates are suggested from.
  context: string;
}) {
  const queryClient = useQueryClient();
  const { data: dietPlans } = useQuery({
    queryKey: ['diet-plans', patient?.id],
    queryFn: () => listDietPlans(patient!.id),
    enabled: !!patient,
  });
  const [kind, setKind] = useState<DietKind>('VEG');
  const [templateId, setTemplateId] = useState('');
  const [planText, setPlanText] = useState('');
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);
  const suggested = suggestDietTemplates(context);

  const apply = (id: string, k: DietKind = kind) => {
    const t = DIET_TEMPLATES.find((x) => x.id === id);
    setTemplateId(id);
    if (t) setPlanText(dietTemplateText(t, k));
  };

  const save = useMutation({
    mutationFn: () => createDietPlan({ patientId: patient!.id, consultationId, admissionId, dietaryPreference: kind, planText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diet-plans', patient?.id] });
      setPlanText('');
      setTemplateId('');
    },
  });
  const send = useMutation({
    mutationFn: (id: string) => sendDietPlanWhatsApp(id),
    onSuccess: (n) => setWhatsappStatus(n.status === 'SENT' ? 'Diet plan sent on WhatsApp.' : `Diet plan not sent: ${n.error}`),
  });

  return (
    <Card title="Diet plan" subtitle="Pick a template suited to the diagnosis, edit it and save">
      {!patient ? (
        <p className="text-sm text-gray-400">Loading patient…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5" role="radiogroup" aria-label="Diet">
              {(['VEG', 'NON_VEG'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    setKind(k);
                    if (templateId) apply(templateId, k);
                  }}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${kind === k ? (k === 'VEG' ? 'bg-green-600 text-white' : 'bg-red-700 text-white') : 'text-gray-600'}`}
                  data-testid={`diet-kind-${k}`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <select value={templateId} onChange={(e) => apply(e.target.value)} className={`${inputClass} !w-auto`} aria-label="Diet template" data-testid="diet-template">
              <option value="">All templates…</option>
              {DIET_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          <div data-testid="diet-suggestions">
            {suggested.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Suggested</span>
                {suggested.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => apply(t.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${templateId === t.id ? 'border-teal bg-teal-light text-teal' : 'border-gray-300 text-gray-700 hover:border-teal hover:text-teal'}`}
                    data-testid="diet-suggestion"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                {context.trim() ? 'No template matches the diagnosis — pick one from the list.' : 'Enter the chief complaint or diagnosis to get suggestions, or pick from the list.'}
              </p>
            )}
          </div>

          <textarea
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            placeholder="The diet plan — pick a template above, or write your own"
            rows={planText ? 10 : 3}
            className={`${inputClass} font-mono text-[13px]`}
            data-testid="diet-plan-text"
          />
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !planText.trim()} className={btnPrimary} data-testid="save-diet-plan">
            Save diet plan
          </button>
          {save.isError && <p className="text-sm text-red-600">{(save.error as any).response?.data?.message ?? 'Could not save'}</p>}

          {dietPlans && dietPlans.length > 0 && (
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-700">Earlier diet plans</h3>
              {dietPlans.map((plan) => (
                <div key={plan.id} className="rounded-lg border border-gray-200 p-3" data-testid="diet-plan">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      {KIND_LABEL[plan.dietaryPreference]}
                      {plan.admissionId ? ' · IPD' : ''}
                    </span>
                    <span className="text-xs text-gray-400">{new Date(plan.createdAt).toLocaleDateString('en-IN')}</span>
                  </div>
                  <p className="whitespace-pre-line text-sm text-gray-700">{plan.planText}</p>
                  <button
                    type="button"
                    onClick={() => send.mutate(plan.id)}
                    disabled={send.isPending || !patient.whatsappOptIn}
                    className="mt-2 rounded-md border border-teal px-3 py-1 text-xs text-teal hover:bg-teal-light disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send on WhatsApp
                  </button>
                </div>
              ))}
              {!patient.whatsappOptIn && <p className="text-xs text-gray-400">The patient hasn't opted in to WhatsApp messages.</p>}
            </div>
          )}
          {whatsappStatus && <p className="text-sm text-teal">{whatsappStatus}</p>}
        </div>
      )}
    </Card>
  );
}
