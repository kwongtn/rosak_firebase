// Pure mapping from ENVIRONMENT_NAME to favicon variant.
// Side-effect-free on purpose so it can be unit-tested without touching the
// filesystem. The build script (generate-favicon.mjs) imports this.
//
//   "staging"    -> "blue"
//   "production" -> "default"  (orange — the current production look, unchanged)
//   unset / "development" / anything else -> "green"  (local dev)
export function selectVariant(environmentName) {
  if (environmentName === "staging") return "blue";
  if (environmentName === "production") return "default";
  return "green";
}
