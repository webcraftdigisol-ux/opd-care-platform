/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Clinics' own addresses are <clinic code>.<this>, e.g. ohmscare.in.
  readonly VITE_CLINIC_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
