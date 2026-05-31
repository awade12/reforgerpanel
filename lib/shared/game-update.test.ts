import assert from "node:assert/strict";
import test from "node:test";
import { branchesForInstances, cronRunKey, describeNextCronRun, matchesSimpleCron } from "./game-update";

test("matchesSimpleCron matches minute and hour in UTC", () => {
  const now = new Date("2026-05-31T04:00:02.000Z");
  assert.equal(matchesSimpleCron("0 4 * * *", now), true);
  assert.equal(matchesSimpleCron("0 5 * * *", now), false);
});

test("cronRunKey deduplicates same schedule slot", () => {
  const now = new Date("2026-05-31T04:00:02.000Z");
  assert.equal(cronRunKey("0 4 * * *", now), cronRunKey("0 4 * * *", now));
});

test("describeNextCronRun returns future ISO timestamp", () => {
  const now = new Date("2026-05-31T21:00:00.000Z");
  assert.equal(describeNextCronRun("0 4 * * *", now), "2026-06-01T04:00:00.000Z");
});

test("branchesForInstances always includes stable and experimental when used", () => {
  assert.deepEqual(branchesForInstances(["stable"]), ["stable"]);
  assert.deepEqual(branchesForInstances(["stable", "experimental"]), ["stable", "experimental"]);
});
