export async function register() {
  // "Tell me when it's done" pushes need a timer on the server (PLAN.md §18). Node only; the edge runtime has no DB.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRunAlertSweep } = await import("./lib/run-alerts");
    startRunAlertSweep();
  }
}
