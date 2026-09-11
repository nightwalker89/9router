import { NextResponse } from "next/server";
import { getCustomModels, addCustomModel, deleteCustomModel } from "@/models";
import { OVERRIDABLE_CAPABILITIES } from "@/shared/constants/models";
import { setCapabilityOverride, clearCapabilityOverridesFor } from "@/lib/capabilityOverridesDb";

export const dynamic = "force-dynamic";

// Capabilities ticked in the "Add model" dialog. Only `true` is meaningful here:
// an unticked box means "let the capability tables decide", not "force off", so
// persisting false would wrongly blind a model that really does read images.
function enabledCaps(caps) {
  if (!caps || typeof caps !== "object") return [];
  return OVERRIDABLE_CAPABILITIES.filter((key) => caps[key] === true);
}

// GET /api/models/custom - List all custom models
export async function GET() {
  try {
    const models = await getCustomModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching custom models:", error);
    return NextResponse.json({ error: "Failed to fetch custom models" }, { status: 500 });
  }
}

// POST /api/models/custom - Add custom model
export async function POST(request) {
  try {
    const { providerAlias, id, type, name, caps } = await request.json();
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    const added = await addCustomModel({ providerAlias, id, type: type || "llm", name });
    // Capabilities live in the override store, not on the model record: they must
    // reach getCapabilitiesForModel on the request path, and the same mechanism
    // has to work for built-in models that were never added by hand.
    for (const capability of enabledCaps(caps)) {
      await setCapabilityOverride(providerAlias, id, capability, true);
    }
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.log("Error adding custom model:", error);
    return NextResponse.json({ error: "Failed to add custom model" }, { status: 500 });
  }
}

// DELETE /api/models/custom?providerAlias=xxx&id=yyy&type=zzz
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "llm";
    if (!providerAlias || !id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    await deleteCustomModel({ providerAlias, id, type });
    // Don't leave the override behind to silently reattach if the model is re-added.
    await clearCapabilityOverridesFor(providerAlias, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting custom model:", error);
    return NextResponse.json({ error: "Failed to delete custom model" }, { status: 500 });
  }
}
