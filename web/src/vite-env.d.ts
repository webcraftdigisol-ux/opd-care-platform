/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PATIENT_PORTAL_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
