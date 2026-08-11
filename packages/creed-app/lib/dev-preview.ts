// Dev-only preview catalog + request bus. Used by WelcomeDevPreview so the
// Cmd/Ctrl+D panel and the preview chords stay in one place as previews grow.

export type DevPreviewId =
  | "welcome"
  | "getting-started"
  | "onboarding"
  | "version"
  | "loader"
  | "billing";

export type DevPreviewItem = {
  id: DevPreviewId;
  key: string;
  label: string;
};

export const DEV_PREVIEW_ITEMS: readonly DevPreviewItem[] = [
  { id: "welcome", key: "P", label: "Welcome tour" },
  { id: "getting-started", key: "G", label: "Get started card" },
  { id: "onboarding", key: "O", label: "Onboarding" },
  { id: "version", key: "V", label: "New version toast" },
  { id: "loader", key: "L", label: "First-load screen" },
  { id: "billing", key: "B", label: "Billing dialog" },
] as const;

const EVENT_NAME = "creed:dev-preview";

export function requestDevPreview(id: DevPreviewId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { id } }));
}

export function onDevPreviewRequest(
  handler: (id: DevPreviewId) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ id?: DevPreviewId }>).detail;
    if (!detail?.id) return;
    handler(detail.id);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
