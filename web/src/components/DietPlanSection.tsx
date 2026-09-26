import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DietaryPreference, PublicUser } from '@opd/shared';
import { createDietPlan, listDietPlans, sendDietPlanWhatsApp } from '../api/dietplans';

const DIETARY_PREFERENCE_OPTIONS: { value: DietaryPreference; label: string }[] = [
  { value: 'VEG', label: 'Vegetarian' },
  { value: 'NON_VEG', label: 'Non-vegetarian' },
  { value: 'EGGETARIAN', label: 'Eggetarian' },
  { value: 'VEGAN', label: 'Vegan' },
];

// The consultation page's diet plan section: earlier plans (each can be
// sent on WhatsApp) and a form for a new one.
export function DietPlanSection({ patient, consultationId }: { patient: PublicUser | undefined; consultationId?: string }) {
  const queryClient = useQueryClient();
  const { data: dietPlans } = useQuery({
    queryKey: ['diet-plans', patient?.id],
    queryFn: () => listDietPlans(patient!.id),
    enabled: !!patient,
  });
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>('VEG');
  const [allergies, setAllergies] = useState('');
  const [localFoodNotes, setLocalFoodNotes] = useState('');
  const [planText, setPlanText] = useState('');
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);

  const dietPlanMutation = useMutation({
    mutationFn: () =>
      createDietPlan({
        patientId: patient!.id,
        consultationId,
        dietaryPreference,
        allergies: allergies || undefined,
        localFoodNotes: localFoodNotes || undefined,
        planText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diet-plans', patient?.id] });
      setAllergies('');
      setLocalFoodNotes('');
      setPlanText('');
    },
  });

  const sendDietPlanMutation = useMutation({
    mutationFn: (id: string) => sendDietPlanWhatsApp(id),
    onSuccess: (notification) =>
      setWhatsappStatus(
        notification.status === 'SENT' ? 'Diet plan sent via WhatsApp.' : `Diet plan not sent: ${notification.error}`,
      ),
  });


  return (
      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Diet Plan</h2>
        {patient ? (
          <>
            {dietPlans && dietPlans.length > 0 && (
              <div className="mb-4 space-y-3">
                {dietPlans.map((plan) => (
                  <div key={plan.id} className="rounded-md border border-gray-200 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {DIETARY_PREFERENCE_OPTIONS.find((o) => o.value === plan.dietaryPreference)?.label}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(plan.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-700">{plan.planText}</p>
                    {plan.allergies && <p className="mt-1 text-xs text-gray-500">Allergies: {plan.allergies}</p>}
                    {plan.localFoodNotes && <p className="text-xs text-gray-500">Local food notes: {plan.localFoodNotes}</p>}
                    <button
                      onClick={() => sendDietPlanMutation.mutate(plan.id)}
                      disabled={sendDietPlanMutation.isPending || !patient.whatsappOptIn}
                      className="mt-2 rounded-md border border-teal px-3 py-1 text-xs text-teal hover:bg-teal-light disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send via WhatsApp
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!patient.whatsappOptIn && (
              <p className="mb-3 text-xs text-gray-400">Patient hasn't opted in to WhatsApp messages yet.</p>
            )}

            <div className="space-y-3 rounded-md border border-gray-200 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Dietary preference</label>
                <select
                  value={dietaryPreference}
                  onChange={(e) => setDietaryPreference(e.target.value as DietaryPreference)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-teal focus:outline-none"
                >
                  {DIETARY_PREFERENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Allergies (optional)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none"
              />
              <input
                value={localFoodNotes}
                onChange={(e) => setLocalFoodNotes(e.target.value)}
                placeholder="Locally available food notes (optional)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none"
              />
              <textarea
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                placeholder="Diet plan / recommendation, informed by the patient's history, complaints and the fields above"
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none"
              />
              <button
                onClick={() => dietPlanMutation.mutate()}
                disabled={dietPlanMutation.isPending || !planText.trim()}
                className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-mid disabled:opacity-60"
              >
                Save diet plan
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">Loading patient…</p>
        )}
        {whatsappStatus && <p className="mt-3 text-sm text-teal">{whatsappStatus}</p>}
      </section>
  );
}
