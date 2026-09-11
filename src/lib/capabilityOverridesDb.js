// Manual per-model capability overrides, set from the dashboard.
//
// Kept out of db.json and next to disabledModels.json instead: this file is read
// synchronously on the request hot path (see open-sse/providers/capabilityOverrides.js),
// so it must stay small and must not change every time an unrelated setting does.
//
// Shape: { overrides: { "<providerId>/<modelId>": { vision: true, pdf: false } } }
// A capability absent from an entry means "auto" — the capability tables decide.

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "@/lib/dataDir.js";
import { canonicalProviderId, invalidateCapabilityOverrides } from "open-sse/providers/capabilityOverrides.js";
import { OVERRIDABLE_CAPABILITIES } from "@/shared/constants/models";

const DB_FILE = path.join(DATA_DIR, "modelCapabilityOverrides.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultData = { overrides: {} };

let dbInstance = null;

async function getDb() {
  if (!dbInstance) {
    const adapter = new JSONFile(DB_FILE);
    dbInstance = new Low(adapter, defaultData);
    try {
      await dbInstance.read();
    } catch (error) {
      if (error instanceof SyntaxError) {
        dbInstance.data = { ...defaultData };
        await dbInstance.write();
      } else {
        throw error;
      }
    }
    if (!dbInstance.data || typeof dbInstance.data !== "object") dbInstance.data = { ...defaultData };
    if (!dbInstance.data.overrides) dbInstance.data.overrides = {};
  }
  return dbInstance;
}

// "commandcode" + "deepseek/deepseek-v4.1-flash" -> "commandcode/deepseek/deepseek-v4.1-flash"
export function overrideKey(provider, modelId) {
  return `${canonicalProviderId(provider)}/${modelId}`;
}

export async function getCapabilityOverrides() {
  const db = await getDb();
  return db.data.overrides || {};
}

/**
 * Force one capability on or off, or hand it back to the tables.
 * @param {string} provider  provider id (not the UI alias)
 * @param {string} modelId   upstream model id
 * @param {string} capability  one of OVERRIDABLE_CAPABILITIES
 * @param {boolean|null} value  true/false to force, null to reset to auto
 */
export async function setCapabilityOverride(provider, modelId, capability, value) {
  if (!provider || !modelId) return;
  if (!OVERRIDABLE_CAPABILITIES.includes(capability)) return;

  const db = await getDb();
  const key = overrideKey(provider, modelId);
  const entry = { ...(db.data.overrides[key] || {}) };

  if (value === null || value === undefined) delete entry[capability];
  else entry[capability] = Boolean(value);

  // Drop the entry entirely once every capability is back on auto, so the file
  // does not accumulate empty objects for models the user only toggled and undid.
  if (Object.keys(entry).length === 0) delete db.data.overrides[key];
  else db.data.overrides[key] = entry;

  await db.write();
  // mtime granularity can hide a write that lands in the same millisecond as the
  // reader's last stat, so drop the cache explicitly rather than relying on it.
  invalidateCapabilityOverrides();
}

export async function clearCapabilityOverridesFor(provider, modelId) {
  if (!provider || !modelId) return;
  const db = await getDb();
  delete db.data.overrides[overrideKey(provider, modelId)];
  await db.write();
  invalidateCapabilityOverrides();
}
