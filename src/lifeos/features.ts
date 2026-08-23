// Regional compliance switches.
//
// The UAE licenses voice and video over IP: carrying consumer VoIP is reserved
// for licensed operators, so Life OS ships with its LiveKit calling surface
// hidden. Nothing is deleted. Every entry point — navigation, Home, the couple
// space, the browser invitation route, and the token endpoint — reads this one
// flag, so a deployment in a jurisdiction where consumer calling is permitted
// re-enables the whole feature with VITE_ENABLE_CALLS=true in the client build
// and ENABLE_CALLS=true on the server.

/** Environment flags are strings; only an explicit "true" opts in. */
export function isFlagEnabled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

/** Live audio and video calling. Off unless a deployment opts in. */
export const CALLS_ENABLED = isFlagEnabled(import.meta.env.VITE_ENABLE_CALLS);

/** Shown if a stored link or notification still points at a call. */
export const CALLS_DISABLED_NOTICE =
  'Live audio and video calling is switched off in this region.';
