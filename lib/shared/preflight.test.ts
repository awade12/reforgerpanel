import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultConfig, prepareConfigForLaunch } from "./config-schema";
import { buildConfigPreflightChecks, mergePreflightReport } from "./preflight";

test("buildConfigPreflightChecks passes valid production-style config", () => {
  const config = createDefaultConfig({
    name: "Test",
    scenarioId: "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
    publicPort: 2001,
    publicAddress: "51.81.84.40",
  });

  const report = mergePreflightReport(buildConfigPreflightChecks(config, "51.81.84.40"));
  assert.equal(report.canStart, true);
  assert.equal(report.errorCount, 0);

  const disk = prepareConfigForLaunch(config, "51.81.84.40");
  const a2s = disk.a2s as { address: string };
  assert.equal(a2s.address, "0.0.0.0");
});

test("buildConfigPreflightChecks warns when form has public IP in a2s bind", () => {
  const config = createDefaultConfig({
    name: "Test",
    scenarioId: "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
    publicPort: 2001,
    publicAddress: "51.81.84.40",
  });
  config.a2s.address = "51.81.84.40";

  const report = mergePreflightReport(buildConfigPreflightChecks(config, "51.81.84.40"));
  assert.equal(report.canStart, true);
  assert.ok(report.checks.some((c) => c.id === "a2s-raw-public" && c.severity === "warn"));
});

test("buildConfigPreflightChecks requires publicAddress", () => {
  const config = createDefaultConfig({
    name: "Test",
    scenarioId: "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
    publicPort: 2001,
  });

  const report = mergePreflightReport(buildConfigPreflightChecks(config));
  assert.equal(report.canStart, false);
});
