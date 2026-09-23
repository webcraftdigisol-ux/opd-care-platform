// Patient-facing screens (self-registration, booking, records) stay hidden
// until the patient phase -- see PATIENT_PORTAL_DISABLED_MESSAGE in
// @opd/shared. The server enforces the same switch independently.
export const PATIENT_PORTAL_ENABLED = import.meta.env.VITE_PATIENT_PORTAL_ENABLED === 'true';
