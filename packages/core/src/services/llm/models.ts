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
    id: 'deepseek/deepseek-v3.2',
    name: 'DeepSeek V3.2',
    vendor: 'DeepSeek',
    context: 128_000,
    inputPrice: 0.27,
    outputPrice: 1.1,
    description: 'Best card quality per dollar on dense, technical PDFs. The default.',
    recommended: true,
  },
  {
    id: 'moonshotai/kimi-k2',
    name: 'Kimi K2',
    vendor: 'Moonshot AI',
    context: 128_000,
    inputPrice: 0.6,
    outputPrice: 2.5,
    description: 'Strong reasoning on long documents. Good for dense textbook chapters.',
  },
  {
    id: 'qwen/qwen3-max',
    name: 'Qwen3 Max',
    vendor: 'Alibaba',
    context: 256_000,
    inputPrice: 1.2,
    outputPrice: 6,
    description: 'Alibaba’s flagship. Handles long, multilingual source documents well.',
  },
  {
    id: 'z-ai/glm-4.6',
    name: 'GLM-4.6',
    vendor: 'Zhipu AI',
    context: 128_000,
    inputPrice: 0.6,
    outputPrice: 2.2,
    description: 'Fast and cheap. Good for short handouts and lecture slides.',
  },
  {
    id: 'anthropic/claude-sonnet-5',
    name: 'Claude Sonnet 5',
    vendor: 'Anthropic',
    context: 1_000_000,
    inputPrice: 3,
    outputPrice: 15,
    description: 'Near-frontier quality, noticeably pricier. Good for bulk decks that need extra polish.',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    vendor: 'Anthropic',
    context: 200_000,
    inputPrice: 1,
    outputPrice: 5,
    description: 'Fastest Claude option. Best for short handouts and lecture slides.',
  },
];

export const DEFAULT_MODEL_ID = 'deepseek/deepseek-v3.2';

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
