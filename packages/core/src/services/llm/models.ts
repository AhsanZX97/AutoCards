import type { ModelInfo } from './types';

/**
 * Model catalog shown in the generation and settings screens.
 *
 * Slugs follow OpenRouter's `vendor/model` convention and prices are USD per
 * million tokens. This list is a stand-in: once a real key is wired up, replace
 * it with a live `GET https://openrouter.ai/api/v1/models` fetch so pricing and
 * availability stay current instead of drifting against this file.
 */
export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: 'anthropic/claude-opus-5',
    name: 'Claude Opus 5',
    vendor: 'Anthropic',
    context: 1_000_000,
    inputPrice: 5,
    outputPrice: 25,
    description: 'Best card quality on dense, technical PDFs. The default.',
    recommended: true,
  },
  {
    id: 'anthropic/claude-sonnet-5',
    name: 'Claude Sonnet 5',
    vendor: 'Anthropic',
    context: 1_000_000,
    inputPrice: 3,
    outputPrice: 15,
    description: 'Near-Opus quality, noticeably cheaper. Good default for bulk decks.',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    vendor: 'Anthropic',
    context: 200_000,
    inputPrice: 1,
    outputPrice: 5,
    description: 'Fastest and cheapest. Best for short handouts and lecture slides.',
  },
  {
    id: 'anthropic/claude-fable-5',
    name: 'Claude Fable 5',
    vendor: 'Anthropic',
    context: 1_000_000,
    inputPrice: 10,
    outputPrice: 50,
    description: 'Most capable. Worth it for research papers and legal texts.',
  },
];

export const DEFAULT_MODEL_ID = 'anthropic/claude-opus-5';

export function findModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((model) => model.id === id);
}

/** Rough USD cost for a job, priced off the bundled catalog. */
export function estimateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  return costOf(undefined, modelId, promptTokens, completionTokens);
}

/**
 * USD cost for a job. Prices against `catalog` when one is supplied — the live
 * OpenRouter catalog, whose prices move — and against the bundled list
 * otherwise. Returns 0 for a model neither list knows.
 */
export function costOf(
  catalog: readonly ModelInfo[] | undefined,
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const model = catalog?.find((entry) => entry.id === modelId) ?? findModel(modelId);
  if (!model) return 0;
  return (
    (promptTokens / 1_000_000) * model.inputPrice +
    (completionTokens / 1_000_000) * model.outputPrice
  );
}
