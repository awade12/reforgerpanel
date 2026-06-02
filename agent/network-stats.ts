import fs from "fs";
import { execSync } from "child_process";

export type NetworkRates = {
  interface: string;
  ingressMbps: number;
  egressMbps: number;
};

type Counter = { iface: string; rxBytes: number; txBytes: number; at: number };

const SKIP_IFACE = /^(lo|docker|veth|br-|virbr|tun|tap|wg|cni|flannel|calico|kube)/;

const live = { counter: null as Counter | null, cache: null as NetworkRates | null };
const store = { counter: null as Counter | null, cache: null as NetworkRates | null };

function primaryInterface() {
  try {
    const out = execSync("ip route get 1.1.1.1 2>/dev/null", { encoding: "utf8" });
    const match = out.match(/\bdev\s+(\S+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function readIfaceBytes(): Map<string, { rx: number; tx: number }> {
  const map = new Map<string, { rx: number; tx: number }>();
  const raw = fs.readFileSync("/proc/net/dev", "utf8");
  for (const line of raw.split("\n").slice(2)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [ifacePart, rest] = trimmed.split(":");
    if (!ifacePart || !rest) continue;
    const iface = ifacePart.trim();
    if (SKIP_IFACE.test(iface)) continue;
    const cols = rest.trim().split(/\s+/);
    const rx = Number(cols[0]);
    const tx = Number(cols[8]);
    if (!Number.isFinite(rx) || !Number.isFinite(tx)) continue;
    map.set(iface, { rx, tx });
  }
  return map;
}

function pickInterface(map: Map<string, { rx: number; tx: number }>) {
  const preferred = primaryInterface();
  if (preferred && map.has(preferred)) return preferred;
  let best: string | null = null;
  let bestTotal = -1;
  for (const [iface, bytes] of map) {
    const total = bytes.rx + bytes.tx;
    if (total > bestTotal) {
      bestTotal = total;
      best = iface;
    }
  }
  return best;
}

function toMbps(bytes: number, elapsedSec: number) {
  if (elapsedSec <= 0) return 0;
  return Math.round(((bytes * 8) / elapsedSec / 1_000_000) * 100) / 100;
}

function computeRates(
  state: { counter: Counter | null; cache: NetworkRates | null },
  minElapsedSec: number,
): NetworkRates | null {
  const map = readIfaceBytes();
  const iface = pickInterface(map);
  if (!iface) return state.cache;
  const current = map.get(iface)!;
  const now = Date.now();
  const fallback = state.cache ?? { interface: iface, ingressMbps: 0, egressMbps: 0 };

  if (!state.counter || state.counter.iface !== iface) {
    state.counter = { iface, rxBytes: current.rx, txBytes: current.tx, at: now };
    state.cache = { interface: iface, ingressMbps: 0, egressMbps: 0 };
    return state.cache;
  }

  const elapsedSec = (now - state.counter.at) / 1000;
  if (elapsedSec < minElapsedSec) {
    return { ...fallback, interface: iface };
  }

  const rxDelta = Math.max(0, current.rx - state.counter.rxBytes);
  const txDelta = Math.max(0, current.tx - state.counter.txBytes);
  state.counter = { iface, rxBytes: current.rx, txBytes: current.tx, at: now };
  state.cache = {
    interface: iface,
    ingressMbps: toMbps(rxDelta, elapsedSec),
    egressMbps: toMbps(txDelta, elapsedSec),
  };
  return state.cache;
}

export function getNetworkRates(): NetworkRates | null {
  return computeRates(live, 4);
}

export function sampleNetworkRatesForStorage(): NetworkRates | null {
  return computeRates(store, 12);
}
