export type SidebarInstance = {
  id: string;
  name: string;
  status: string;
  config: { publicPort: number };
};

let cache: SidebarInstance[] | null = null;

export function getSidebarInstancesCache(): SidebarInstance[] {
  return cache ?? [];
}

export async function loadSidebarInstances(
  fetcher: () => Promise<SidebarInstance[]> = async () => {
    const res = await fetch("/api/agent/instances");
    if (!res.ok) return cache ?? [];
    return res.json() as Promise<SidebarInstance[]>;
  },
): Promise<SidebarInstance[]> {
  const list = await fetcher();
  cache = list;
  return list;
}
