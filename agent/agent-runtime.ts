const startedAt = Date.now();

export function getAgentRuntime() {
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSec,
  };
}
