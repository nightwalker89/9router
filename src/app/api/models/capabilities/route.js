import { NextResponse } from "next/server";
import { getCapabilityOverrides, setCapabilityOverride, clearCapabilityOverridesFor } from "@/lib/capabilityOverridesDb";
import { OVERRIDABLE_CAPABILITIES } from "@/shared/constants/models";

export const dynamic = "force-dynamic";

// GET /api/models/capabilities
// -> { overrides: { "<providerId>/<modelId>": { vision: true } }, overridable: [...] }
export async function GET() {
  try {
    const overrides = await getCapabilityOverrides();
    return NextResponse.json({ overrides, overridable: OVERRIDABLE_CAPABILITIES });
  } catch (error) {
    console.log("Error fetching capability overrides:", error);
    return NextResponse.json({ error: "Failed to fetch capability overrides" }, { status: 500 });
  }
}

// POST /api/models/capabilities  body: { provider, modelId, capability, value }
// value: true | false to force, null to hand the capability back to the tables.
export async function POST(request) {
  try {
    const { provider, modelId, capability, value } = await request.json();
    if (!provider || !modelId || !capability) {
      return NextResponse.json({ error: "provider, modelId and capability required" }, { status: 400 });
    }
    if (!OVERRIDABLE_CAPABILITIES.includes(capability)) {
      return NextResponse.json(
        { error: `capability must be one of: ${OVERRIDABLE_CAPABILITIES.join(", ")}` },
        { status: 400 },
      );
    }
    if (value !== null && typeof value !== "boolean") {
      return NextResponse.json({ error: "value must be true, false or null" }, { status: 400 });
    }

    await setCapabilityOverride(provider, modelId, capability, value);
    const overrides = await getCapabilityOverrides();
    return NextResponse.json({ success: true, overrides });
  } catch (error) {
    console.log("Error saving capability override:", error);
    return NextResponse.json({ error: "Failed to save capability override" }, { status: 500 });
  }
}

// DELETE /api/models/capabilities?provider=xxx&modelId=yyy — back to full auto.
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const modelId = searchParams.get("modelId");
    if (!provider || !modelId) {
      return NextResponse.json({ error: "provider and modelId required" }, { status: 400 });
    }
    await clearCapabilityOverridesFor(provider, modelId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error clearing capability override:", error);
    return NextResponse.json({ error: "Failed to clear capability override" }, { status: 500 });
  }
}
