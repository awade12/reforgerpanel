"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/Shell";

export function useInstanceLogs(id: string, enabled = true) {
  const [logs, setLogs] = useState("");
  const [logFile, setLogFile] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [followTail, setFollowTail] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const logOffset = useRef(0);
  const logPath = useRef<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const loadLogs = useCallback(async () => {
    const data = await api<{ content: string; nextByte: number; fps: number | null; latest: string | null }>(
      `instances/${id}/logs?from=${logOffset.current}`,
    );

    if (data.latest && data.latest !== logPath.current) {
      const rotated = logPath.current !== null;
      logPath.current = data.latest;
      setLogFile(data.latest);
      if (rotated) {
        logOffset.current = 0;
        setLogs("");
        return loadLogs();
      }
    }

    if (data.content) setLogs((prev) => prev + data.content);
    if (data.nextByte > logOffset.current) logOffset.current = data.nextByte;
    if (data.fps != null) setFps(data.fps);
  }, [id]);

  useEffect(() => {
    if (!enabled || !followTail) {
      sourceRef.current?.close();
      sourceRef.current = null;
      setStreaming(false);
      return;
    }

    const source = new EventSource(`/api/agent/instances/${id}/logs/stream`);
    sourceRef.current = source;
    setStreaming(true);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          content?: string;
          nextByte?: number;
          fps?: number | null;
          latest?: string | null;
        };
        if (data.latest && data.latest !== logPath.current) {
          logPath.current = data.latest;
          setLogFile(data.latest);
          logOffset.current = 0;
          setLogs("");
        }
        if (data.content) {
          setLogs((prev) => prev + data.content);
        }
        if (data.nextByte != null && data.nextByte > logOffset.current) {
          logOffset.current = data.nextByte;
        }
        if (data.fps != null) setFps(data.fps);
      } catch {
        /* ignore malformed events */
      }
    };

    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      setStreaming(false);
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setStreaming(false);
    };
  }, [enabled, followTail, id]);

  useEffect(() => {
    if (!enabled || followTail) return;
    void loadLogs().catch(() => undefined);
    const timer = setInterval(() => {
      void loadLogs().catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [enabled, followTail, loadLogs]);

  const clear = useCallback(() => {
    setLogs("");
    logOffset.current = 0;
  }, []);

  return { logs, logFile, fps, followTail, setFollowTail, clear, reload: loadLogs, streaming };
}
