/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional OpenRouter key for local development. Vite inlines this into the
   * client bundle, so never set it for a deployed build — ship without it and
   * let each user supply their own key in Settings → Generation.
   */
  readonly VITE_OPENROUTER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
