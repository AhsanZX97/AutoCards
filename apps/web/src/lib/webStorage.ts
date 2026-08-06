import type { StorageAdapter } from '@autocards/core';

export function createWebStorage(): StorageAdapter {
  return {
    async getItem(key) {
      return window.localStorage.getItem(key);
    },
    async setItem(key, value) {
      window.localStorage.setItem(key, value);
    },
    async removeItem(key) {
      window.localStorage.removeItem(key);
    },
  };
}
