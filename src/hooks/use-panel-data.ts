"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/Shell";
import { peekApiCache } from "@/lib/panel-api-cache";

export function usePanelData<T>(path: string) {
  const cached = peekApiCache<T>(path);
  const [data, setData] = useState<T | undefined>(cached);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const result = await api<T>(path);
    setData(result);
    setError("");
    setLoading(false);
    return result;
  }, [path]);

  useEffect(() => {
    let active = true;
    setError("");
    if (peekApiCache<T>(path) === undefined) setLoading(true);

    void api<T>(path)
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [path]);

  return { data, loading, error, reload, setData };
}
