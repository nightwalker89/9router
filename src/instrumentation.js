export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();

    // Server-only: lets capabilities.js read the synced catalog without pulling
    // node:fs into the dashboard's browser bundle.
    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();

    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();

    // Start the app bootstrap here, not only from the root layout.
    //
    // layout.js is evaluated when the first page is RENDERED, so an instance
    // that nobody opens in a browser never reached initializeApp() — and that
    // is the normal case for the two ways this app actually restarts: the
    // launchd agent at login (`--tray`, RunAtLoad) and `n9router --update`
    // followed by `launchctl kickstart`. Neither opens the dashboard, so the
    // tunnel was never auto-resumed despite tunnelEnabled being true, and the
    // stored tunnelUrl was left pointing at a dead tunnel.
    //
    // instrumentation.register() runs once per server start regardless of page
    // traffic. bootstrap.js is idempotent (build-phase guard plus a
    // global.__appBootstrapped singleton), so the layout import stays harmless.
    await import("@/shared/services/bootstrap");
  }
}
