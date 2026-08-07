import { describe, expect, it } from 'vitest';
import { LlmConfigError, RoutingLlmService } from '../routingLlm';
import type { OpenRouterConfig } from '../openRouter';

describe('RoutingLlmService', () => {
  it('throws LlmConfigError when no config is available', () => {
    const service = new RoutingLlmService(() => undefined);
    expect(() => service.active()).toThrow(LlmConfigError);
  });

  it('throws LlmConfigError when the key is blank', () => {
    const service = new RoutingLlmService(() => ({ apiKey: '' }));
    expect(() => service.active()).toThrow(LlmConfigError);
  });

  it('throws LlmConfigError when the key is only whitespace', () => {
    const service = new RoutingLlmService(() => ({ apiKey: '   ' }));
    expect(() => service.active()).toThrow(LlmConfigError);
  });

  it('uses OpenRouter once a key is available', () => {
    const service = new RoutingLlmService(() => ({ apiKey: 'sk-or-test' }));
    expect(service.id).toBe('openrouter');
  });

  it('starts working without being rebuilt once a key appears', () => {
    let key = '';
    const service = new RoutingLlmService(() => ({ apiKey: key }));
    expect(() => service.active()).toThrow(LlmConfigError);

    key = 'sk-or-test';
    expect(service.active().id).toBe('openrouter');
  });

  it('throws again once the key is cleared', () => {
    let key = 'sk-or-test';
    const service = new RoutingLlmService(() => ({ apiKey: key }));
    expect(service.active().id).toBe('openrouter');

    key = '';
    expect(() => service.active()).toThrow(LlmConfigError);
  });

  it('reuses the same OpenRouter instance while the key is unchanged', () => {
    const service = new RoutingLlmService(() => ({ apiKey: 'sk-or-test' }));
    expect(service.active()).toBe(service.active());
  });

  it('rebuilds the OpenRouter instance when the key changes', () => {
    let key = 'sk-or-one';
    const service = new RoutingLlmService(() => ({ apiKey: key }));
    const first = service.active();

    key = 'sk-or-two';
    expect(service.active()).not.toBe(first);
  });

  it('re-reads the config on every call rather than caching it', () => {
    let reads = 0;
    const service = new RoutingLlmService((): OpenRouterConfig => {
      reads += 1;
      return { apiKey: 'sk-or-test' };
    });
    service.active();
    service.active();
    expect(reads).toBe(2);
  });
});
