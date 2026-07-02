import { ImageResponse } from "next/og";
import { accentColorMap } from "@/lib/creed-data";
import { parseDocumentSections } from "@/lib/document-sections";
import { readPublicSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const alt = "Document preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

function textFromRichContent(content: string) {
  return content
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function trimPreview(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}...`;
}

export default async function PublicDocumentOpenGraphImage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const admin = getSupabaseAdminClient();
  const document = await readPublicSharedDocument(admin, decodeURIComponent(shareId));
  const sections = document ? parseDocumentSections(document.content).filter((section) => !section.archived) : [];
  const previewSections = sections.slice(0, 4).map((section) => ({
    name: section.name,
    accent: accentColorMap[section.accent],
    text: trimPreview(textFromRichContent(section.content), 96),
  }));
  const title = document?.title?.trim() || "Shared document";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#F7F5EF",
          color: "#1C1C1A",
          padding: 64,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 26,
            color: "#6B6760",
          }}
        >
          <div
            style={{
              width: 28,
              height: 36,
              border: "4px solid #1C1C1A",
              borderRadius: 5,
              display: "flex",
            }}
          />
          <span>Shared document</span>
        </div>

        <div
          style={{
            marginTop: 42,
            fontSize: title.length > 52 ? 54 : 66,
            lineHeight: 1.08,
            fontWeight: 600,
            letterSpacing: 0,
            maxWidth: 980,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: 46,
            display: "flex",
            flexDirection: "column",
            gap: 18,
            width: "100%",
          }}
        >
          {previewSections.length > 0 ? (
            previewSections.map((section) => (
              <div
                key={section.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  fontSize: 28,
                  color: "#4F4B45",
                }}
              >
                <div
                  style={{
                    width: 5,
                    height: 32,
                    borderRadius: 999,
                    background: section.accent,
                    flexShrink: 0,
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ color: section.accent, fontWeight: 600 }}>
                    {section.name}
                  </div>
                  {section.text ? (
                    <div style={{ fontSize: 22, color: "#777169" }}>{section.text}</div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 28, color: "#6B6760" }}>Read-only public document</div>
          )}
        </div>
      </div>
    ),
    size
  );
}
