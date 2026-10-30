/** Minimal string store. Implementations must never throw to the caller. */
export interface KeyValueStore {
  read(key: string): string | null;
  write(key: string, value: string): boolean;
}

export function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    read: (key) => values.get(key) ?? null,
    write: (key, value) => {
      values.set(key, value);
      return true;
    },
  };
}

/** localStorage when it is usable (private windows and blocked sites can throw), otherwise memory. */
export function browserStore(): KeyValueStore {
  try {
    const probe = '__haikufps_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
  } catch {
    return memoryStore();
  }
  return {
    read: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (key, value) => {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };
}
