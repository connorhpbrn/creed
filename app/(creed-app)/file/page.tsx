import { notFound } from "next/navigation";
import { FileScreen } from "@/components/creed/file-screen";
import {
  listDocumentActivity,
  listDocumentComments,
  listPendingCommentsForUser,
  listWorkspaceUsers,
} from "@/lib/document-collaboration";
import { listSharedDocumentFolders, readSharedDocument } from "@/lib/shared-documents";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FilePage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string; comment?: string }>;
}) {
  const params = await searchParams;
  const documentSlug = params.document?.trim();

  if (!documentSlug) {
    return <FileScreen />;
  }

  const supabase = await createSupabaseServerClient();
  const document = await readSharedDocument(supabase, decodeURIComponent(documentSlug));

  if (!document) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = getSupabaseAdminClient();
  const [comments, activity, users, pendingComments, folders] = await Promise.all([
    listDocumentComments(admin, document.id),
    listDocumentActivity(admin, document.id),
    listWorkspaceUsers(admin),
    // Pending agent-proposed comments are private to their proposer; only ever
    // fetched scoped to the signed-in viewer.
    user?.id
      ? listPendingCommentsForUser(admin, document.id, user.id)
      : Promise.resolve([]),
    // Only needed to resolve the parent folder's slug for back-navigation.
    document.folderId ? listSharedDocumentFolders(supabase) : Promise.resolve([]),
  ]);

  // Back-navigation returns to the parent folder when the document lives in one,
  // otherwise to the dashboard root.
  const parentFolder = document.folderId
    ? folders.find((folder) => folder.id === document.folderId) ?? null
    : null;
  const back = parentFolder
    ? {
        href: `/dashboard/folder/${encodeURIComponent(parentFolder.slug)}`,
        label: `Back to ${parentFolder.name}`,
      }
    : { href: "/dashboard", label: "Back to dashboard" };

  return (
    <FileScreen
      sharedDocument={{
        document,
        comments,
        pendingComments,
        activity,
        users,
        currentUserId: user?.id ?? null,
        activeCommentId: params.comment ?? null,
        back,
      }}
    />
  );
}
