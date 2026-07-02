import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicDocumentScreen } from "@/components/creed/public-document-screen";
import {
  listDocumentActivity,
  listDocumentComments,
} from "@/lib/document-collaboration";
import { readPublicSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function readPublicDocumentForShare(shareId: string) {
  const admin = getSupabaseAdminClient();
  return readPublicSharedDocument(admin, decodeURIComponent(shareId));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const document = await readPublicDocumentForShare(shareId);
  const title = document?.title?.trim() || "Shared document";
  const imageUrl = `/share/${encodeURIComponent(shareId)}/opengraph-image`;

  return {
    title: { absolute: title },
    description: "",
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      type: "article",
      title,
      description: "",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${title} preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: "",
      images: [imageUrl],
    },
  };
}

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const admin = getSupabaseAdminClient();
  const document = await readPublicSharedDocument(admin, decodeURIComponent(shareId));

  if (!document) {
    notFound();
  }

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect(`/file?document=${encodeURIComponent(document.slug)}`);
    }
  }

  const [comments, activity] = await Promise.all([
    listDocumentComments(admin, document.id),
    listDocumentActivity(admin, document.id),
  ]);

  return (
    <PublicDocumentScreen
      shareId={shareId}
      document={document}
      initialComments={comments}
      initialActivity={activity}
    />
  );
}
