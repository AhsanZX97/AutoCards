import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '../../lib/storage';
import { createUsageStore } from '../usageStore';

const JAN = new Date('2026-01-15T09:00:00.000Z');
const FEB = new Date('2026-02-02T09:00:00.000Z');

function setup() {
  return createUsageStore(createMemoryStorage());
}

describe('createUsageStore', () => {
  it('starts an account at zero uploads', () => {
    expect(setup().getState().getUploads('user_1', JAN)).toEqual({ period: '2026-01', uploads: 0 });
  });

  it('counts each recorded upload', () => {
    const store = setup();
    store.getState().recordUpload('user_1', JAN);
    store.getState().recordUpload('user_1', JAN);
    expect(store.getState().getUploads('user_1', JAN).uploads).toBe(2);
  });

  it('keeps accounts on the same device apart', () => {
    const store = setup();
    store.getState().recordUpload('user_1', JAN);
    expect(store.getState().getUploads('user_2', JAN).uploads).toBe(0);
  });

  it('reads last month’s count as a fresh allowance', () => {
    const store = setup();
    store.getState().recordUpload('user_1', JAN);
    expect(store.getState().getUploads('user_1', FEB)).toEqual({ period: '2026-02', uploads: 0 });
  });

  it('restarts the count when an upload lands in a new month', () => {
    const store = setup();
    store.getState().recordUpload('user_1', JAN);
    store.getState().recordUpload('user_1', FEB);
    expect(store.getState().getUploads('user_1', FEB).uploads).toBe(1);
  });
});
