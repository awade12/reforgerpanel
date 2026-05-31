import { agentFetch } from "./agent";
import type { InstanceWithConfig } from "./agent";

export async function listInstances(): Promise<InstanceWithConfig[]> {
  return agentFetch<InstanceWithConfig[]>("/instances");
}

export async function getInstance(id: string): Promise<InstanceWithConfig | null> {
  try {
    return await agentFetch<InstanceWithConfig>(`/instances/${id}`);
  } catch {
    return null;
  }
}

export function resolveInstance(instances: InstanceWithConfig[], query: string): InstanceWithConfig | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  const exact = instances.find(
    (item) => item.id === query || item.slug.toLowerCase() === needle || item.name.toLowerCase() === needle,
  );
  if (exact) return exact;

  return instances.find((item) => item.name.toLowerCase().includes(needle) || item.slug.toLowerCase().includes(needle)) ?? null;
}

export function instanceChoices(instances: InstanceWithConfig[], focused: string) {
  const needle = focused.trim().toLowerCase();
  const filtered = needle
    ? instances.filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.slug.toLowerCase().includes(needle) ||
          item.id.toLowerCase().includes(needle),
      )
    : instances;

  return filtered.slice(0, 25).map((item) => ({
    name: `${item.name} (${item.slug})`.slice(0, 100),
    value: item.id,
  }));
}
