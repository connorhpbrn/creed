export type OnboardingComposeResponse = {
  error?: string;
};

// A conflict can mean either a harmless re-paste after a successful compose or
// that the server has no claimed seed to compose onto. Only the former may move
// the user to the preview screen.
export function isAlreadyComposedConflict(
  status: number,
  response: OnboardingComposeResponse,
) {
  return status === 409 && response.error === "already_composed";
}
