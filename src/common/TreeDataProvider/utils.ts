export const EXPANDED_STORAGE_KEY = "nodesTree.expandedItems";
export const SELECTED_STORAGE_KEY = "nodesTree.selectedItems";

export const readStoredIds = (key: string): Array<string> => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids: Array<string> = [];
    for (const value of parsed)
      if (typeof value === "string" && value.length > 0) ids.push(value);
    return ids;
  } catch (error) {
    console.warn(`Failed to read localStorage key '${key}'`, error);
    return [];
  }
};

export const writeStoredIds = (key: string, values: Array<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch (error) {
    console.warn(`Failed to write localStorage key '${key}'`, error);
  }
};

export const normalizeItems = (
  items: Array<string>,
  predicate: (value: string) => boolean,
): Array<string> => {
  if (items.length === 0) return items;
  const seen = new Set<string>();
  const next: Array<string> = [];
  let changed = false;
  for (const item of items) {
    if (!predicate(item)) {
      changed = true;
      continue;
    }
    if (seen.has(item)) {
      changed = true;
      continue;
    }
    seen.add(item);
    next.push(item);
  }
  if (!changed) return items;
  return next;
};

export const dedupeItems = (items: Array<string>): Array<string> => {
  if (items.length <= 1) return items;
  const seen = new Set<string>();
  const next: Array<string> = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    next.push(item);
  }
  return next;
};
