import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  listModCacheTargets,
  modCacheEntryPath,
  modIdNeedle,
  purgeModCache,
  purgeInstanceModTemp,
  refreshConfiguredMods,
  resolveModCacheRoot,
} from "./mod-cache";

test("modIdNeedle normalizes braces and case", () => {
  assert.equal(modIdNeedle("{698D44529D42FB8C}"), "698d44529d42fb8c");
});

test("resolveModCacheRoot returns top-level addon folder", () => {
  const profile = "/opt/reforger/instances/x/profile";
  const found = path.join(profile, "addons", "698D44529D42FB8C", "nested", "file.bin");
  assert.equal(
    resolveModCacheRoot(profile, found),
    path.join(profile, "addons", "698D44529D42FB8C"),
  );
});

test("listModCacheTargets finds exact mod folder in Addons", () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reforger-mod-cache-"));
  const modRoot = path.join(profile, "Addons", "698D44529D42FB8C");
  fs.mkdirSync(modRoot, { recursive: true });
  assert.deepEqual(listModCacheTargets({ profilePath: profile }, "698d44529d42fb8c"), [modRoot]);
  fs.rmSync(profile, { recursive: true, force: true });
});

test("purgeModCache removes cached mod directory", () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reforger-mod-cache-"));
  const modRoot = path.join(profile, "addons", "698D44529D42FB8C");
  fs.mkdirSync(path.join(modRoot, "data"), { recursive: true });
  fs.writeFileSync(path.join(modRoot, "data", "mod.gproj"), "test");

  assert.equal(modCacheEntryPath(profile, "698D44529D42FB8C"), modRoot);
  assert.equal(purgeModCache(profile, "698D44529D42FB8C"), true);
  assert.equal(fs.existsSync(modRoot), false);
  assert.equal(purgeModCache(profile, "698D44529D42FB8C"), false);

  fs.rmSync(profile, { recursive: true, force: true });
});

test("refreshConfiguredMods clears temp dirs and reports missing mods", () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reforger-mod-cache-"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reforger-mod-tmp-"));
  const modRoot = path.join(profile, "addons", "60EEF465FD67ECF8");
  fs.mkdirSync(modRoot, { recursive: true });
  fs.mkdirSync(path.join(profile, "temp", "chunk"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "partial.bin"), "x");
  fs.writeFileSync(path.join(profile, "temp", "chunk", "partial.bin"), "x");

  const lines: string[] = [];
  const result = refreshConfiguredMods(
    { profilePath: profile, addonTempDir: tmp },
    [
      { modId: "60EEF465FD67ECF8", name: "Cached mod", required: true },
      { modId: "61E57C95FF956A54", name: "Missing mod", required: true },
    ],
    (line) => lines.push(line),
  );

  assert.equal(result.results.length, 2);
  assert.match(result.results[0]?.detail ?? "", /Cache cleared/);
  assert.match(result.results[1]?.detail ?? "", /Not cached/);
  assert.equal(fs.existsSync(modRoot), false);
  assert.equal(fs.existsSync(path.join(tmp, "partial.bin")), false);
  assert.equal(fs.existsSync(path.join(profile, "temp", "chunk")), false);
  assert.equal(lines.length, 2);

  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("purgeInstanceModTemp clears addon temp and profile temp", () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "reforger-mod-cache-"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reforger-mod-tmp-"));
  fs.mkdirSync(path.join(profile, "temp", "a"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "x"), "1");
  purgeInstanceModTemp({ profilePath: profile, addonTempDir: tmp });
  assert.equal(fs.existsSync(path.join(tmp, "x")), false);
  assert.equal(fs.existsSync(path.join(profile, "temp", "a")), false);
  fs.rmSync(profile, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});
