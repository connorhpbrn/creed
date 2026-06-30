import type { Metadata } from "next";
import { LocalDocsScreen } from "@/components/local-docs/local-docs-screen";
import { getLocalDocsPayload } from "@/lib/local-docs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Local docs",
};

export default async function LocalDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  const params = await searchParams;
  const payload = await getLocalDocsPayload(params.doc);
  return <LocalDocsScreen initialPayload={payload} />;
}
