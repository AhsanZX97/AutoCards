import type { StateStorage } from 'zustand/middleware';
import type { StorageAdapter } from '../lib/storage';

/** Adapts our minimal `StorageAdapter` to zustand's persist middleware. */
export function toZustandStorage(adapter: StorageAdapter): StateStorage {
  return {
    getItem: (name) => adapter.getItem(name),
    setItem: (name, value) => adapter.setItem(name, value),
    removeItem: (name) => adapter.removeItem(name),
  };
}
