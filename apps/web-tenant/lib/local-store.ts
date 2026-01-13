import { resolveTenantSlug } from "@/lib/tenant";

function keyFor(resource: string) {
  const slug = resolveTenantSlug(typeof window === "undefined" ? undefined : window.location.hostname);
  return `presence360:${slug ?? "default"}:${resource}`;
}

export function loadLocalItems<T extends { id: string }>(resource: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(keyFor(resource));
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function saveLocalItems<T extends { id: string }>(resource: string, items: T[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(keyFor(resource), JSON.stringify(items));
}

export function upsertLocalItem<T extends { id: string }>(resource: string, item: T) {
  const items = loadLocalItems<T>(resource);
  const next = items.filter((entry) => entry.id !== item.id);
  next.unshift(item);
  saveLocalItems(resource, next);
  return next;
}

export function mergeById<T extends { id: string }>(serverItems: T[], localItems: T[]) {
  const map = new Map<string, T>();
  serverItems.forEach((item) => map.set(item.id, item));
  localItems.forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}
