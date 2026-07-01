import "server-only";
import { getGitHubFileSnapshot } from "@/lib/github";
import { readSharedDocumentById, type SharedDocument } from "@/lib/shared-documents";

export type MappedSharedDocument = SharedDocument & {
  githubRepoOwner: string;
  githubRepoName: string;
  githubBranch: string;
  githubPath: string;
};

export async function readMappedSharedDocument(
  client: unknown,
  documentId: string
): Promise<MappedSharedDocument> {
  const document = await readSharedDocumentById(client, documentId);
  if (!document) {
    throw new Error("Document not found.");
  }
  if (
    !document.githubRepoOwner ||
    !document.githubRepoName ||
    !document.githubBranch ||
    !document.githubPath
  ) {
    throw new Error("Document is not mapped to GitHub yet.");
  }
  return document as MappedSharedDocument;
}

export function readMappedDocumentGitHubFile(
  accessToken: string,
  document: MappedSharedDocument
) {
  return getGitHubFileSnapshot(
    accessToken,
    document.githubRepoOwner,
    document.githubRepoName,
    document.githubPath,
    document.githubBranch
  );
}
