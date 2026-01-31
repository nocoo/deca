export type KeyStoreState = {
  key: string;
  lastFetchedAt: number | null;
};

const storageKey = "deca.console.key";
const timestampKey = "deca.console.key.fetched_at";

export const readKeyStore = (): KeyStoreState => {
  if (typeof window === "undefined") {
    return { key: "", lastFetchedAt: null };
  }
  const key = window.localStorage.getItem(storageKey) || "";
  const timestampValue = window.localStorage.getItem(timestampKey);
  const lastFetchedAt = timestampValue ? Number(timestampValue) : null;
  return {
    key,
    lastFetchedAt: Number.isFinite(lastFetchedAt) ? lastFetchedAt : null,
  };
};

export const writeKeyStore = (key: string) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey, key);
  window.localStorage.setItem(timestampKey, String(Date.now()));
};

export const clearKeyStore = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(storageKey);
  window.localStorage.removeItem(timestampKey);
};
