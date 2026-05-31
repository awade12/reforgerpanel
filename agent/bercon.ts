import dgram from "dgram";
import { resolvePublicAddress } from "../lib/shared/config-schema";
import { deriveRconPort } from "../lib/shared/network-ports";
import { readBattleyeConfig } from "./battleye";
import { getHostInfo, getInstanceDetailed } from "./instances";

function crc32(buf: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildPacket(body: Buffer) {
  const crcInput = Buffer.concat([Buffer.from([0xff]), body]);
  const header = Buffer.alloc(7);
  header.write("BE", 0, "ascii");
  header.writeUInt32BE(crc32(crcInput), 2);
  header.writeUInt8(0xff, 6);
  return Buffer.concat([header, body]);
}

export type BerconTarget = {
  hosts: string[];
  ports: number[];
  password: string;
  beRconPort: number | null;
};

export function resolveBerconTarget(instanceId: string): BerconTarget {
  const item = getInstanceDetailed(instanceId);
  if (!item) throw new Error("Instance not found");

  const host = getHostInfo();
  const be = readBattleyeConfig(instanceId);
  const password = (be.rconPassword ?? item.config.rcon?.password ?? "").trim();
  const gamePort = item.config.publicPort || item.config.bindPort || 0;
  const ports = [
    be.rconPort,
    item.config.rcon?.port,
    gamePort ? deriveRconPort(gamePort, item.config.rcon?.port) : null,
  ].filter((port): port is number => typeof port === "number" && port > 0);
  const hosts = [
    "127.0.0.1",
    item.config.rcon?.address?.trim(),
    resolvePublicAddress(item.config, host.publicIpHint),
    host.publicIpHint,
    item.config.bindAddress?.trim(),
  ].filter((value): value is string => Boolean(value));
  return {
    hosts: [...new Set(hosts)],
    ports: [...new Set(ports)],
    password,
    beRconPort: be.rconPort,
  };
}

class BerconClient {
  private socket = dgram.createSocket("udp4");
  private sequence = 0;

  constructor(
    private host: string,
    private port: number,
    private password: string,
  ) {}

  close() {
    try {
      this.socket.close();
    } catch {
      /* already closed */
    }
  }

  private send(body: Buffer) {
    return new Promise<void>((resolve, reject) => {
      this.socket.send(buildPacket(body), this.port, this.host, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private waitForBody(match: (body: Buffer) => boolean, timeoutMs: number) {
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`BattlEye RCon timed out on UDP ${this.port}`));
      }, timeoutMs);

      const onMessage = (msg: Buffer) => {
        if (msg.length < 8 || msg.toString("ascii", 0, 2) !== "BE") return;
        const body = msg.subarray(7);
        if (body[0] === 0x02 && body.length >= 2) {
          void this.send(Buffer.from([0x02, body[1]])).catch(() => undefined);
          return;
        }
        if (!match(body)) return;
        cleanup();
        resolve(body);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off("message", onMessage);
      };

      this.socket.on("message", onMessage);
    });
  }

  async login() {
    await this.send(Buffer.concat([Buffer.from([0x00]), Buffer.from(this.password, "ascii")]));
    const response = await this.waitForBody((body) => body[0] === 0x00, 4000);
    if (response.length < 2 || response[1] !== 0x01) {
      throw new Error(`BattlEye login failed on UDP ${this.port} — check RCon password`);
    }
  }

  async runCommand(command: string) {
    const seq = this.sequence++ & 0xff;
    await this.send(Buffer.concat([Buffer.from([0x01, seq]), Buffer.from(command, "ascii")]));

    return new Promise<string>((resolve) => {
      let commandResponse = "";
      const serverMessages: string[] = [];
      let settleTimer: ReturnType<typeof setTimeout> | null = null;
      const maxTimer = setTimeout(() => finish(), 8000);

      const finish = () => {
        clearTimeout(maxTimer);
        if (settleTimer) clearTimeout(settleTimer);
        this.socket.off("message", onMessage);
        const parts = [commandResponse, ...serverMessages].filter(Boolean);
        resolve(parts.join("\n"));
      };

      const bumpSettle = () => {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish(), 500);
      };

      const onMessage = (msg: Buffer) => {
        if (msg.length < 8 || msg.toString("ascii", 0, 2) !== "BE") return;
        const body = msg.subarray(7);
        if (body[0] === 0x02 && body.length >= 2) {
          void this.send(Buffer.from([0x02, body[1]])).catch(() => undefined);
          serverMessages.push(body.subarray(2).toString("ascii"));
          bumpSettle();
          return;
        }
        if (body[0] === 0x01 && body[1] === seq) {
          commandResponse = body.subarray(2).toString("ascii");
          bumpSettle();
        }
      };

      this.socket.on("message", onMessage);
      bumpSettle();
    });
  }
}

function parseBerconPlayers(output: string) {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const players: {
    id: number;
    ip: string;
    ping: number;
    guid: string;
    name: string;
  }[] = [];

  for (const line of lines) {
    if (line.includes("Logged In!") || line.includes("Processing Command:")) continue;
    if (/^Players on server:/i.test(line)) continue;

    if (line.includes(";")) {
      const parts = line.split(";").map((part) => part.trim());
      if (parts.length >= 3 && !/\[Player/i.test(parts[0])) {
        const id = Number(parts[0]) || 0;
        if (id <= 0) continue;
        players.push({
          id,
          ip: "",
          ping: 0,
          guid: parts[1] ?? "",
          name: parts.slice(2).join(" ; ") || "Unknown",
        });
        continue;
      }
    }

    const parts = line.split(/\s+/);
    if (parts.length >= 4 && Number(parts[0]) > 0) {
      players.push({
        id: Number(parts[0]) || 0,
        ip: parts[1] ?? "",
        ping: Number(parts[2]) || 0,
        guid: parts[3] ?? "",
        name: parts.slice(4).join(" ") || "Unknown",
      });
    }
  }

  return players;
}

async function withBerconClient<T>(
  target: BerconTarget,
  run: (client: BerconClient, port: number) => Promise<T>,
): Promise<{ result: T; port: number }> {
  if (!target.password || target.password.length < 3) {
    throw new Error("BattlEye RCon password not configured — append RCon in the BattlEye panel, then restart the server");
  }
  if (!target.ports.length) {
    throw new Error("No RCon port configured — set RCon port in config or BattlEye panel");
  }
  if (!target.hosts.length) {
    throw new Error("No RCon host configured — set rcon.address or publicAddress in config");
  }

  let lastError: Error | null = null;
  for (const host of target.hosts) {
    for (const port of target.ports) {
      const client = new BerconClient(host, port, target.password);
      try {
        await client.login();
        const result = await run(client, port);
        client.close();
        return { result, port };
      } catch (err) {
        client.close();
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  throw lastError ?? new Error("BattlEye RCon connection failed — ensure the instance is running");
}

export async function berconCommandForInstance(instanceId: string, command: string) {
  const target = resolveBerconTarget(instanceId);
  const { result, port } = await withBerconClient(target, (client) => client.runCommand(command));
  return { output: result, port };
}

export async function berconPlayersForInstance(instanceId: string) {
  const { output, port } = await berconCommandForInstance(instanceId, "#players");
  return { raw: output, players: parseBerconPlayers(output), port };
}

export async function berconCommand(host: string, port: number, password: string, command: string) {
  const client = new BerconClient(host, port, password);
  try {
    await client.login();
    return await client.runCommand(command);
  } finally {
    client.close();
  }
}

export async function berconPlayers(host: string, port: number, password: string) {
  const raw = await berconCommand(host, port, password, "#players");
  return { raw, players: parseBerconPlayers(raw) };
}
