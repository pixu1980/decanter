import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeProfile, parseLegacyConf, profileFromLegacy } from "../../src/core/profile.ts";

const GK2_CONF = `
# Profile for "Graveyard Keeper 2".
GAME_NAME="Graveyard Keeper 2"
GAME_SLUG="graveyard-keeper-2"
GAME_ENV_PREFIX="GK2"
GAME_APPID=4358690
GAME_DEPOT=4358691
GAME_EXE="GraveyardKeeper2.exe"
GAME_INSTALL_SUBDIR="GK2"
GAME_DATA_SUBDIR="users/crossover/AppData/LocalLow/Lazy Bear Games/Graveyard Keeper 2"
GAME_WINE_RUNTIME="wine-devel"
GAME_WINE_VERSION="11.18"
GAME_BACKUP_LABEL="GK2"   # trailing comment
GAME_SAVE_PATTERNS=('*.dat' '*.info')
GAME_VERSION_PATTERN='Starting game, ver\\. [0-9A-Za-z.]+'
GAME_WINDOW_MODE=1
GAME_REG_KEY='HKCU\\Software\\Lazy Bear Games\\Graveyard Keeper 2'
GAME_SETTINGS_VALUE='settings_h1277500064'
`;

test("parseLegacyConf reads scalars, arrays and trailing comments", () => {
  const { values } = parseLegacyConf(GK2_CONF);
  assert.equal(values.GAME_NAME, "Graveyard Keeper 2");
  assert.equal(values.GAME_APPID, "4358690");
  assert.equal(values.GAME_BACKUP_LABEL, "GK2");
  assert.deepEqual(values.GAME_SAVE_PATTERNS, ["*.dat", "*.info"]);
  assert.equal(values.GAME_REG_KEY, "HKCU\\Software\\Lazy Bear Games\\Graveyard Keeper 2");
});

test("parseLegacyConf captures hook function bodies", () => {
  const { functions } = parseLegacyConf(`
game_post_import() {
  sm_log "installing OpenAL"
  "$WINE" oalinst.exe /S
}
game_doctor_extra() {
  sm_check pass "OpenAL"
}
`);
  assert.match(functions.game_post_import ?? "", /oalinst\.exe/);
  assert.match(functions.game_doctor_extra ?? "", /sm_check pass/);
});

test("profileFromLegacy maps a legacy profile onto the schema", () => {
  const profile = profileFromLegacy(GK2_CONF, "fallback");
  assert.equal(profile.name, "Graveyard Keeper 2");
  assert.equal(profile.slug, "graveyard-keeper-2");
  assert.equal(profile.appid, 4358690);
  assert.equal(profile.depot, 4358691);
  assert.equal(profile.wineRuntime, "wine-devel");
  assert.equal(profile.wineVersion, "11.18");
  assert.deepEqual(profile.savePatterns, ["*.dat", "*.info"]);
  assert.equal(profile.window.enabled, true);
  assert.equal(profile.window.regKey, "HKCU\\Software\\Lazy Bear Games\\Graveyard Keeper 2");
});

test("normalizeProfile derives slug, env prefix and defaults", () => {
  const profile = normalizeProfile({ name: "The Cosmic Wheel Sisterhood" });
  assert.equal(profile.slug, "the-cosmic-wheel-sisterhood");
  assert.equal(profile.envPrefix, "TCWS");
  assert.equal(profile.bundleId, "local.the-cosmic-wheel-sisterhood");
  assert.equal(profile.wineRuntime, "gptk");
  assert.equal(profile.window.enabled, false);
  assert.deepEqual(profile.savePatterns, []);
  assert.deepEqual(profile.runtimeHistory, []);
});
