/**
 * Node 25+ ships its own experimental Web Storage and exposes a `localStorage`
 * global that is NOT a working Storage unless a file is configured (no
 * `clear()`, `setItem()`…). In vitest's jsdom environment that global shadows
 * jsdom's own implementation, so every test touching `window.localStorage`
 * fails with "localStorage.clear is not a function" on a recent Node.
 *
 * This installs a plain in-memory Storage when, and only when, the one
 * available is unusable. On Node 22 (the version the project targets) jsdom's
 * own implementation works and nothing here runs. Loaded for every test file
 * (see vitest.config.ts) but a no-op outside a DOM environment.
 */
function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => (data.has(String(key)) ? (data.get(String(key)) as string) : null),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(String(key));
    },
    setItem: (key: string, value: string) => {
      data.set(String(key), String(value));
    },
  };
  return storage as unknown as Storage;
}

function isUsable(name: "localStorage" | "sessionStorage"): boolean {
  try {
    const candidate = (globalThis as Record<string, unknown>)[name] as Partial<Storage> | undefined;
    return typeof candidate?.getItem === "function" && typeof candidate?.setItem === "function" && typeof candidate?.clear === "function";
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    if (isUsable(name)) continue;
    const storage = createMemoryStorage();
    for (const target of [globalThis, window] as object[]) {
      Object.defineProperty(target, name, { value: storage, configurable: true, writable: true });
    }
  }
}
