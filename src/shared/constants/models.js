// Import directly from file to avoid pulling in server-side dependencies via index.js
export {
  PROVIDER_MODELS,
  getProviderModels,
  getDefaultModel,
  isValidModel as isValidModelCore,
  findModelName,
  getModelTargetFormat,
  getModelStrip,
  PROVIDER_ID_TO_ALIAS,
  getModelsByProviderId,
  getModelUpstreamId,
  getModelQuotaFamily
} from "open-sse/config/providerModels.js";

import { AI_PROVIDERS, isOpenAICompatibleProvider } from "./providers.js";
import { PROVIDER_MODELS as MODELS } from "open-sse/config/providerModels.js";

// Providers that accept any model (passthrough)
const PASSTHROUGH_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, p]) => p.passthroughModels)
    .map(([key]) => key)
);

// Wrap isValidModel with passthrough providers
export function isValidModel(aliasOrId, modelId) {
  if (isOpenAICompatibleProvider(aliasOrId)) return true;
  if (PASSTHROUGH_PROVIDERS.has(aliasOrId)) return true;
  const models = MODELS[aliasOrId];
  if (!models) return false;
  return models.some(m => m.id === modelId);
}

// Legacy AI_MODELS for backward compatibility
export const AI_MODELS = Object.entries(MODELS).flatMap(([alias, models]) =>
  models.map(m => ({ provider: alias, model: m.id, name: m.name }))
);

export const getModelKind = (m, fallback = null) => m?.kind || m?.type || fallback;

// Capacity metadata for UI badges — icon + label + color per capability.
// `overridable` marks the input modalities a user may force on or off per model.
// They are plain booleans that only decide whether media is stripped from a
// request, so a wrong value costs an image rather than breaking the call.
// Reasoning is not overridable: it travels with thinkingFormat (an enum) and
// forcing it alone would emit a thinking config the model cannot parse.
export const CAPACITY_META = {
  vision: { icon: "visibility", label: "Vision", desc: "Supports image input", color: "text-blue-500", overridable: true },
  pdf: { icon: "picture_as_pdf", label: "Documents", desc: "Supports PDF / document input", color: "text-rose-500", overridable: true },
  audioInput: { icon: "graphic_eq", label: "Audio", desc: "Supports audio input", color: "text-violet-500", overridable: true },
  // search: temporarily hidden (feature not wired yet)
  reasoning: { icon: "neurology", label: "Reasoning", desc: "Supports reasoning / thinking", color: "text-amber-500" },
};

// Single source of truth for both the dashboard and the server-side override store.
export const OVERRIDABLE_CAPABILITIES = Object.keys(CAPACITY_META).filter((k) => CAPACITY_META[k].overridable);
