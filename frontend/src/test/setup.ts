import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';

const isDomEnvironment = typeof document !== 'undefined';

afterEach(() => {
  if (!isDomEnvironment) return;
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new IDBFactory(),
    writable: true,
  });
});
