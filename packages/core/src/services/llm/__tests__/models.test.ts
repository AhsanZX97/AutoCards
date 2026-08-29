import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL_ID,
  DEFAULT_VISION_MODEL_ID,
  MODEL_CATALOG,
  findModel,
  isVisionModel,
} from '../models';

describe('model catalog', () => {
  it('offers each slug once', () => {
    const ids = MODEL_CATALOG.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('defaults to a model it actually offers', () => {
    expect(findModel(DEFAULT_MODEL_ID)).toBeDefined();
  });

  it('falls back to a model that can see, so a run with pictures has somewhere to go', () => {
    expect(findModel(DEFAULT_VISION_MODEL_ID)).toBeDefined();
    expect(isVisionModel(DEFAULT_VISION_MODEL_ID)).toBe(true);
  });

  it('offers MiMo-V2.5 as a model that reads images', () => {
    expect(findModel('xiaomi/mimo-v2.5')).toBeDefined();
    expect(isVisionModel('xiaomi/mimo-v2.5')).toBe(true);
  });
});
