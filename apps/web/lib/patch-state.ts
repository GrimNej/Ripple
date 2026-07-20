export type PatchUiState =
  | "loading"
  | "reviewReady"
  | "editing"
  | "applying"
  | "applied"
  | "verifying"
  | "verified"
  | "verificationFailed"
  | "humanRequired"
  | "stalePatch"
  | "staleAsset"
  | "alreadyDecided"
  | "sessionExpired";

type PatchEvent =
  | "LOAD_REVIEW"
  | "EDIT"
  | "APPLY"
  | "APPLIED"
  | "VERIFY"
  | "VERIFIED"
  | "VERIFY_FAILED"
  | "HUMAN_REQUIRED"
  | "STALE_PATCH"
  | "STALE_ASSET"
  | "ALREADY_DECIDED"
  | "SESSION_EXPIRED";

const transitions: Record<PatchUiState, Partial<Record<PatchEvent, PatchUiState>>> = {
  loading: { LOAD_REVIEW: "reviewReady", SESSION_EXPIRED: "sessionExpired" },
  reviewReady: { APPLY: "applying", EDIT: "editing", SESSION_EXPIRED: "sessionExpired" },
  editing: { APPLY: "applying", LOAD_REVIEW: "reviewReady", SESSION_EXPIRED: "sessionExpired" },
  applying: {
    ALREADY_DECIDED: "alreadyDecided",
    APPLIED: "applied",
    SESSION_EXPIRED: "sessionExpired",
    STALE_ASSET: "staleAsset",
    STALE_PATCH: "stalePatch",
  },
  applied: { VERIFY: "verifying" },
  verifying: {
    HUMAN_REQUIRED: "humanRequired",
    SESSION_EXPIRED: "sessionExpired",
    VERIFIED: "verified",
    VERIFY_FAILED: "verificationFailed",
  },
  verified: {},
  verificationFailed: {},
  humanRequired: {},
  stalePatch: {},
  staleAsset: {},
  alreadyDecided: {},
  sessionExpired: {},
};

export function patchTransition(state: PatchUiState, event: PatchEvent): PatchUiState {
  return transitions[state][event] ?? state;
}
