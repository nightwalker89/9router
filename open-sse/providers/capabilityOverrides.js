// Read side of the manual per-model capability overrides set in the dashboard.
//
// Same shape as catalogOverride.js: the file is the source of truth and the only
// thing held in memory is a parsed copy dropped as soon as the mtime changes.
// getCapabilitiesForModel is synchronous and runs per request, so the hot path is
// one stat (~1us) and the parse only reruns after the dashboard writes.
//
// Unlike the catalog and the name heuristic — both strictly additive — this layer
// is the only one allowed to turn a capability OFF, because it is the user saying
// so explicitly about a model they are actually billed for.

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/dataDir.js";
import REGISTRY from "./registry/index.js";
import { OVERRIDABLE_CAPABILITIES } from "@/shared/constants/models";

export { OVERRIDABLE_CAPABILITIES };

export const OVERRIDES_FILE = path.join(DATA_DIR, "modelCapabilityOverrides.json");

const EMPTY = new Map();
let cache = EMPTY;
let cachedMtime = -1;

// Every token that can address a provider -> the full list of its tokens.
// Needed because the `provider` argument is not consistent across call sites:
// chatCore passes the provider id ("commandcode"), while combo.js splits a combo
// entry and passes the UI alias ("cmc"). One stored key must answer to both.
const PROVIDER_TOKENS = (() => {
  const map = new Map();
  for (const entry of REGISTRY) {
    const tokens = [entry.id, entry.alias, entry.uiAlias, ...(entry.aliases || [])]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase());
    const unique = [...new Set(tokens)];
    for (const token of unique) map.set(token, unique);
  }
  return map;
})();

// The dashboard knows a provider by its storage alias in some paths and by its id
// in others. Normalise on write so one model never ends up with two entries.
export function canonicalProviderId(token) {
  if (!token) return token;
  const tokens = PROVIDER_TOKENS.get(String(token).toLowerCase());
  return tokens ? tokens[0] : token;
}

function baseId(model) {
  return model.includes("/") ? model.split("/").pop() : model;
}

// Keep only known boolean capabilities: the file is user-editable, and an
// unfiltered spread would let anything in it overwrite arbitrary capabilities.
function sanitize(caps) {
  if (!caps || typeof caps !== "object") return null;
  const clean = {};
  for (const key of OVERRIDABLE_CAPABILITIES) {
    if (typeof caps[key] === "boolean") clean[key] = caps[key];
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

function buildIndex(overrides) {
  const index = new Map();
  for (const [key, caps] of Object.entries(overrides || {})) {
    const clean = sanitize(caps);
    if (!clean) continue;

    const slash = key.indexOf("/");
    if (slash <= 0) continue;
    const providerToken = key.slice(0, slash).toLowerCase();
    const modelId = key.slice(slash + 1);
    if (!modelId) continue;

    for (const token of PROVIDER_TOKENS.get(providerToken) || [providerToken]) {
      index.set(`${token}/${modelId}`.toLowerCase(), clean);
      // Also reachable by the vendor-stripped id, matching how the capability
      // tables look models up ("deepseek/deepseek-v4.1-flash" -> "deepseek-v4.1-flash").
      index.set(`${token}/${baseId(modelId)}`.toLowerCase(), clean);
    }
  }
  return index;
}

function load() {
  let mtime;
  try {
    mtime = fs.statSync(OVERRIDES_FILE).mtimeMs;
  } catch {
    cache = EMPTY;
    cachedMtime = -1;
    return cache;
  }
  if (mtime === cachedMtime) return cache;

  cachedMtime = mtime;
  try {
    const parsed = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8"));
    cache = buildIndex(parsed?.overrides);
  } catch {
    cache = EMPTY;
  }
  return cache;
}

/**
 * Capabilities the user forced for this model, or null when it is on auto.
 * @returns {{vision?: boolean, pdf?: boolean, audioInput?: boolean} | null}
 */
export function getModelCapabilityOverride(provider, model) {
  if (!provider || !model) return null;
  const index = load();
  if (index.size === 0) return null;

  const p = String(provider).toLowerCase();
  return index.get(`${p}/${model}`.toLowerCase())
    || index.get(`${p}/${baseId(model)}`.toLowerCase())
    || null;
}

// Force a re-read on the next lookup (called right after the dashboard writes).
export function invalidateCapabilityOverrides() {
  cachedMtime = -1;
}

// Hand the reader to capabilities.js. That module is bundled into the browser
// too, so it cannot import this file directly — the server pushes it in.
export async function installOverrideSource() {
  const { setOverrideSource } = await import("./capabilities.js");
  setOverrideSource({ getOverride: getModelCapabilityOverride });
}
