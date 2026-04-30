// Minimal localStorage / sessionStorage polyfill for static export builds.
// SE-2 dependencies that touch storage at module-import time crash during a
// Next.js static export because Node has no localStorage. We expose an
// in-memory shim before Next runs.
//
// Intentionally we do NOT polyfill window or document — many libraries (like
// goober, used by react-hot-toast) check `typeof window === "object"` and try
// to mount a real <style> element. Leaving window undefined keeps them on
// their no-op SSR path.

const makeStorage = () => {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(i) {
      return Array.from(store.keys())[i] ?? null;
    },
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(String(k), String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
  };
};

if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = makeStorage();
}
if (typeof globalThis.sessionStorage === "undefined") {
  globalThis.sessionStorage = makeStorage();
}
