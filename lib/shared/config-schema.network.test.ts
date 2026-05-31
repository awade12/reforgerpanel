import assert from "node:assert/strict";
import test from "node:test";
import {
  configForDisk,
  createDefaultConfig,
  normalizeServiceBindAddress,
  prepareConfigForLaunch,
  sanitizeNetworkAddresses,
} from "./config-schema";

test("normalizeServiceBindAddress clears mistaken public IP bind", () => {
  assert.equal(normalizeServiceBindAddress("51.81.84.40", "51.81.84.40"), "");
  assert.equal(normalizeServiceBindAddress("0.0.0.0", "51.81.84.40"), "");
  assert.equal(normalizeServiceBindAddress("", "51.81.84.40"), "");
  assert.equal(normalizeServiceBindAddress("192.168.1.10", "51.81.84.40"), "192.168.1.10");
});

test("sanitizeNetworkAddresses keeps publicAddress but not a2s bind on public IP", () => {
  const config = createDefaultConfig({
    name: "Test",
    scenarioId: "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
    publicPort: 2001,
    publicAddress: "51.81.84.40",
  });
  config.a2s.address = "51.81.84.40";
  config.rcon.address = "51.81.84.40";

  const sanitized = sanitizeNetworkAddresses(config, "51.81.84.40");

  assert.equal(sanitized.publicAddress, "51.81.84.40");
  assert.equal(sanitized.a2s.address, "");
  assert.equal(sanitized.rcon.address, "");
});

test("configForDisk omits empty a2s.address — game schema requires IPv4 or absent", () => {
  const config = createDefaultConfig({
    name: "Test",
    scenarioId: "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
    publicPort: 2001,
    publicAddress: "51.81.84.40",
  });

  const disk = prepareConfigForLaunch(config, "51.81.84.40");
  const a2s = disk.a2s as Record<string, unknown> | undefined;

  assert.ok(a2s);
  assert.equal(a2s.port, 17777);
  assert.equal("address" in a2s, false);
  assert.equal(disk.publicAddress, "51.81.84.40");
});
