import 'fake-indexeddb/auto';

// Node có navigator nhưng không có onLine
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
}
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
