/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL and anon key. Both required — see `.env.example`. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * Where the Edge Functions live, when that is not the project URL — set it
   * to `http://localhost:54321` to run generation against a local
   * `supabase start` while everything else stays on the hosted project.
   */
  readonly VITE_SUPABASE_FUNCTIONS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
