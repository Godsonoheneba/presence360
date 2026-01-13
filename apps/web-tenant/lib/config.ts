import type { TenantConfigItem } from "@/lib/types";

export function configItemsToMap(items: TenantConfigItem[]) {
  return items.reduce<Record<string, unknown>>((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
}

export function mapToConfigItems(values: Record<string, unknown>) {
  return Object.entries(values).map(([key, value]) => ({ key, value }));
}
