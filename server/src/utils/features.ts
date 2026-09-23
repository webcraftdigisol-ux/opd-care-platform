// Read per call rather than at module load, so tests can toggle it the same
// way they toggle the Razorpay env vars.
export function isPatientPortalEnabled(): boolean {
  return process.env.PATIENT_PORTAL_ENABLED === 'true';
}
