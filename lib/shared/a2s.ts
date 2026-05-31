import dgram from "dgram";

export type A2sInfo = {
  name: string;
  map: string;
  folder: string;
  game: string;
  appId: number;
  players: number;
  maxPlayers: number;
  bots: number;
  serverType: string;
  environment: string;
  visibility: number;
  vac: number;
  version: string;
  edf?: number;
  port?: number;
  steamId?: string;
  keywords?: string;
  gameId?: string;
};

export type A2sQueryResult =
  | { ok: true; info: A2sInfo; latencyMs: number }
  | { ok: false; error: string; latencyMs?: number };

function readCString(buf: Buffer, offset: number) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const value = buf.toString("utf8", offset, end);
  return { value, next: end + 1 };
}

function parseA2sInfo(payload: Buffer): A2sInfo {
  let offset = 0;
  const protocol = payload.readUInt8(offset);
  offset += 1;
  if (protocol !== 17 && protocol !== 50) {
    throw new Error(`Unexpected A2S protocol ${protocol}`);
  }

  const name = readCString(payload, offset);
  offset = name.next;
  const map = readCString(payload, offset);
  offset = map.next;
  const folder = readCString(payload, offset);
  offset = folder.next;
  const game = readCString(payload, offset);
  offset = game.next;

  const appId = payload.readUInt16LE(offset);
  offset += 2;
  const players = payload.readUInt8(offset);
  offset += 1;
  const maxPlayers = payload.readUInt8(offset);
  offset += 1;
  const bots = payload.readUInt8(offset);
  offset += 1;
  const serverType = String.fromCharCode(payload.readUInt8(offset));
  offset += 1;
  const environment = String.fromCharCode(payload.readUInt8(offset));
  offset += 1;
  const visibility = payload.readUInt8(offset);
  offset += 1;
  const vac = payload.readUInt8(offset);
  offset += 1;
  const version = readCString(payload, offset);
  offset = version.next;

  const info: A2sInfo = {
    name: name.value,
    map: map.value,
    folder: folder.value,
    game: game.value,
    appId,
    players,
    maxPlayers,
    bots,
    serverType,
    environment,
    visibility,
    vac,
    version: version.value,
  };

  if (offset < payload.length) {
    info.edf = payload.readUInt8(offset);
    offset += 1;
    if (info.edf & 0x80) {
      info.port = payload.readUInt16LE(offset);
      offset += 2;
    }
    if (info.edf & 0x10) {
      const steamId = readCString(payload, offset);
      info.steamId = steamId.value;
      offset = steamId.next;
    }
    if (info.edf & 0x01) {
      const keywords = readCString(payload, offset);
      info.keywords = keywords.value;
      offset = keywords.next;
    }
    if (info.edf & 0x20) {
      const gameId = readCString(payload, offset);
      info.gameId = gameId.value;
    }
  }

  return info;
}

function buildInfoQuery(challenge?: number) {
  const base = Buffer.from("Source Engine Query\0", "utf8");
  const buf = Buffer.alloc(5 + base.length + (challenge != null ? 4 : 0));
  buf.writeUInt32LE(0xffffffff, 0);
  buf.writeUInt8(0x54, 4);
  base.copy(buf, 5);
  if (challenge != null) {
    buf.writeInt32LE(challenge, 5 + base.length);
  }
  return buf;
}

function sendQuery(host: string, port: number, packet: Buffer, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("A2S query timed out"));
    }, timeoutMs);

    socket.on("message", (msg) => {
      clearTimeout(timer);
      socket.close();
      resolve(msg);
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });

    socket.send(packet, port, host, (err) => {
      if (err) {
        clearTimeout(timer);
        socket.close();
        reject(err);
      }
    });
  });
}

export async function queryA2s(host: string, port: number, timeoutMs = 2500): Promise<A2sQueryResult> {
  const started = Date.now();
  try {
    let response = await sendQuery(host, port, buildInfoQuery(), timeoutMs);

    if (response.length >= 5 && response.readUInt8(4) === 0x41) {
      const challenge = response.readInt32LE(5);
      response = await sendQuery(host, port, buildInfoQuery(challenge), timeoutMs);
    }

    if (response.length < 6 || response.readUInt8(4) !== 0x49) {
      return { ok: false, error: "Invalid A2S response", latencyMs: Date.now() - started };
    }

    const info = parseA2sInfo(response.subarray(5));
    return { ok: true, info, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}

export function formatPlayerCount(info: A2sInfo) {
  return `${info.players}/${info.maxPlayers}`;
}

export type A2sPlayer = {
  index: number;
  name: string;
  score: number;
  durationSec: number;
};

function buildPlayerQuery(challenge?: number) {
  const buf = Buffer.alloc(challenge != null ? 9 : 5);
  buf.writeUInt32LE(0xffffffff, 0);
  buf.writeUInt8(0x55, 4);
  if (challenge != null) {
    buf.writeInt32LE(challenge, 5);
  }
  return buf;
}

function parseA2sPlayers(payload: Buffer): A2sPlayer[] {
  if (payload.length < 1 || payload.readUInt8(0) !== 0x44) {
    throw new Error("Invalid A2S player response");
  }
  const count = payload.readUInt8(1);
  let offset = 2;
  const players: A2sPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const index = payload.readUInt8(offset);
    offset += 1;
    const name = readCString(payload, offset);
    offset = name.next;
    const score = payload.readInt32LE(offset);
    offset += 4;
    const durationSec = payload.readFloatLE(offset);
    offset += 4;
    players.push({ index, name: name.value, score, durationSec });
  }
  return players;
}

export async function queryA2sPlayers(host: string, port: number, timeoutMs = 2500) {
  const started = Date.now();
  try {
    let response = await sendQuery(host, port, buildPlayerQuery(-1), timeoutMs);
    if (response.length >= 5 && response.readUInt8(4) === 0x41) {
      const challenge = response.readInt32LE(5);
      response = await sendQuery(host, port, buildPlayerQuery(challenge), timeoutMs);
    }
    if (response.length < 6 || response.readUInt8(4) !== 0x44) {
      return { ok: false as const, error: "Invalid A2S player response", latencyMs: Date.now() - started };
    }
    return {
      ok: true as const,
      players: parseA2sPlayers(response.subarray(4)),
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}
