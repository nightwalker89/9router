/**
 * Manual per-model capability overrides.
 *
 * Two things are worth guarding here:
 *  - the override must beat every other layer, including the exact-table hits
 *    that short-circuit before the catalog and the name heuristic, and it is the
 *    only layer allowed to turn a capability OFF;
 *  - a model with no override must resolve exactly as it did before, otherwise
 *    this layer has quietly rewritten the whole capability table.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The reader resolves its file from DATA_DIR at import time, so point that at a
// scratch directory before anything pulls the module in.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "n9router-capoverrides-"));
process.env.DATA_DIR = TMP_DIR;

const { getCapabilitiesForModel, setOverrideSource } = await import("../../open-sse/providers/capabilities.js");
const { getModelCapabilityOverride, invalidateCapabilityOverrides, canonicalProviderId, OVERRIDES_FILE } =
  await import("../../open-sse/providers/capabilityOverrides.js");

function writeOverrides(overrides) {
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify({ overrides }));
  invalidateCapabilityOverrides();
}

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("getCapabilitiesForModel — override merge", () => {
  beforeEach(() => setOverrideSource(null));

  const MODEL = "deepseek/deepseek-v4.1-flash";

  it("leaves every model untouched when no source is installed", () => {
    const before = getCapabilitiesForModel("commandcode", MODEL);
    setOverrideSource({ getOverride: () => null });
    expect(getCapabilitiesForModel("commandcode", MODEL)).toEqual(before);
  });

  it("forces a capability ON for a model the tables resolve as text-only", () => {
    expect(getCapabilitiesForModel("commandcode", MODEL).vision).toBe(false);
    setOverrideSource({ getOverride: () => ({ vision: true }) });
    expect(getCapabilitiesForModel("commandcode", MODEL).vision).toBe(true);
  });

  it("forces a capability OFF — the one thing catalog and name heuristic cannot do", () => {
    const visionModel = "deepseek/deepseek-v4-flash-vision-exp";
    expect(getCapabilitiesForModel("commandcode", visionModel).vision).toBe(true);
    setOverrideSource({ getOverride: () => ({ vision: false }) });
    expect(getCapabilitiesForModel("commandcode", visionModel).vision).toBe(false);
  });

  it("beats an exact table entry, which short-circuits before the other layers", () => {
    // claude-opus-5 is an exact MODEL_CAPABILITIES hit with vision: true.
    expect(getCapabilitiesForModel(null, "claude-opus-5").vision).toBe(true);
    setOverrideSource({ getOverride: () => ({ vision: false }) });
    expect(getCapabilitiesForModel(null, "claude-opus-5").vision).toBe(false);
  });

  it("patches only the named flags, leaving limits and thinking format intact", () => {
    const before = getCapabilitiesForModel("commandcode", MODEL);
    setOverrideSource({ getOverride: () => ({ vision: true }) });
    const after = getCapabilitiesForModel("commandcode", MODEL);

    expect(after.contextWindow).toBe(before.contextWindow);
    expect(after.maxOutput).toBe(before.maxOutput);
    expect(after.thinkingFormat).toBe(before.thinkingFormat);
    expect(after.reasoning).toBe(before.reasoning);
    expect({ ...after, vision: before.vision }).toEqual(before);
  });

  it("still returns the floor for an empty model id", () => {
    setOverrideSource({ getOverride: () => ({ vision: true }) });
    expect(getCapabilitiesForModel("commandcode", "").vision).toBe(false);
  });
});

describe("capabilityOverrides reader", () => {
  beforeEach(() => writeOverrides({}));

  it("returns null when nothing is overridden", () => {
    expect(getModelCapabilityOverride("commandcode", "deepseek/deepseek-v4.1-flash")).toBeNull();
  });

  it("resolves through BOTH the provider id and the UI alias", () => {
    // chatCore passes the provider id; combo.js splits a combo entry and passes
    // the alias. A single stored key has to answer to both or the override
    // applies on one path and not the other.
    writeOverrides({ "commandcode/deepseek/deepseek-v4.1-flash": { vision: true } });

    expect(getModelCapabilityOverride("commandcode", "deepseek/deepseek-v4.1-flash")).toEqual({ vision: true });
    expect(getModelCapabilityOverride("cmc", "deepseek/deepseek-v4.1-flash")).toEqual({ vision: true });
  });

  it("normalises an alias-keyed entry to the same canonical provider id", () => {
    expect(canonicalProviderId("cmc")).toBe("commandcode");
    expect(canonicalProviderId("commandcode")).toBe("commandcode");
    // Unknown tokens pass through rather than being dropped.
    expect(canonicalProviderId("not-a-provider")).toBe("not-a-provider");
  });

  it("also matches the vendor-stripped model id", () => {
    writeOverrides({ "commandcode/deepseek/deepseek-v4.1-flash": { vision: true } });
    expect(getModelCapabilityOverride("commandcode", "deepseek-v4.1-flash")).toEqual({ vision: true });
  });

  it("keeps only known boolean capabilities", () => {
    writeOverrides({
      "commandcode/x": { vision: true, contextWindow: 1, reasoning: true, pdf: "yes", audioInput: false },
    });
    // contextWindow and reasoning are not overridable; pdf is not a boolean.
    expect(getModelCapabilityOverride("commandcode", "x")).toEqual({ vision: true, audioInput: false });
  });

  it("ignores an entry whose capabilities are all unusable", () => {
    writeOverrides({ "commandcode/x": { contextWindow: 999 } });
    expect(getModelCapabilityOverride("commandcode", "x")).toBeNull();
  });

  it("survives a malformed file instead of taking capabilities down with it", () => {
    fs.writeFileSync(OVERRIDES_FILE, "{ not json");
    invalidateCapabilityOverrides();
    expect(getModelCapabilityOverride("commandcode", "deepseek/deepseek-v4.1-flash")).toBeNull();
  });

  it("does not leak one provider's override onto another", () => {
    writeOverrides({ "commandcode/deepseek/deepseek-v4.1-flash": { vision: true } });
    expect(getModelCapabilityOverride("openrouter", "deepseek/deepseek-v4.1-flash")).toBeNull();
  });
});
