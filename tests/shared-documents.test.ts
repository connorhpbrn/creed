import { describe, expect, it } from "vitest";

import {
  updateSharedDocumentFolder,
  updateSharedDocumentMetadata,
} from "@/lib/shared-documents";
import { FakeSupabaseClient } from "./helpers/fake-supabase";

function seedFolders(client: FakeSupabaseClient) {
  const now = new Date().toISOString();
  client.seed("creed_document_folders", [
    {
      id: "folder-root",
      slug: "old-folder",
      name: "Old Folder",
      path: "old-folder",
      parent_id: null,
      archived_at: null,
      updated_at: now,
    },
    {
      id: "folder-child",
      slug: "old-folder-child",
      name: "Child",
      path: "old-folder/child",
      parent_id: "folder-root",
      archived_at: null,
      updated_at: now,
    },
  ]);
}

function seedDocuments(client: FakeSupabaseClient) {
  const now = new Date().toISOString();
  client.seed("creed_documents", [
    {
      id: "doc-root",
      slug: "old-folder-overview",
      title: "Overview",
      description: "",
      content: "# Overview\n\nBody.",
      path: "old-folder/overview.md",
      folder_id: "folder-root",
      github_repo_owner: null,
      github_repo_name: null,
      github_branch: "main",
      github_path: "old-folder/overview.md",
      last_remote_sha: null,
      last_synced_content_hash: "hash",
      last_synced_revision: 1,
      sync_status: "synced",
      revision: 1,
      document_type: "feature",
      stage: "discovery",
      lifecycle: "ideation",
      status: "planning",
      priority: "medium",
      size: "m",
      archived_at: null,
      updated_at: now,
    },
    {
      id: "doc-child",
      slug: "old-folder-child-brief",
      title: "Brief",
      description: "",
      content: "# Brief\n\nBody.",
      path: "old-folder/child/brief.md",
      folder_id: "folder-child",
      github_repo_owner: null,
      github_repo_name: null,
      github_branch: "main",
      github_path: "old-folder/child/brief.md",
      last_remote_sha: null,
      last_synced_content_hash: "hash",
      last_synced_revision: 1,
      sync_status: "synced",
      revision: 1,
      document_type: "feature",
      stage: "discovery",
      lifecycle: "ideation",
      status: "planning",
      priority: "medium",
      size: "m",
      archived_at: null,
      updated_at: now,
    },
  ]);
}

describe("shared document renames", () => {
  it("renames a document and updates its slug and path inside its folder", async () => {
    const client = new FakeSupabaseClient();
    seedFolders(client);
    seedDocuments(client);

    const result = await updateSharedDocumentMetadata(client, {
      id: "doc-root",
      patch: { title: "Commercial Rules" },
      expectedRevision: 1,
      actorUserId: "user-1",
    });

    if (!result.ok) throw new Error(result.error);
    expect(result.value.title).toBe("Commercial Rules");
    expect(result.value.slug).toBe("old-folder-commercial-rules");
    expect(result.value.path).toBe("old-folder/commercial-rules.md");
    expect(result.value.githubPath).toBe("old-folder/commercial-rules.md");
    expect(result.value.revision).toBe(2);
  });

  it("rejects a document rename that would collide with another file", async () => {
    const client = new FakeSupabaseClient();
    seedFolders(client);
    seedDocuments(client);
    const existing = client.rows("creed_documents")[0];
    client.seed("creed_documents", [
      ...client.rows("creed_documents"),
      {
        ...existing,
        id: "doc-existing",
        slug: "old-folder-commercial-rules",
        title: "Commercial Rules",
        path: "old-folder/commercial-rules.md",
        github_path: "old-folder/commercial-rules.md",
      },
    ]);

    const result = await updateSharedDocumentMetadata(client, {
      id: "doc-root",
      patch: { title: "Commercial Rules" },
      expectedRevision: 1,
      actorUserId: "user-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("conflict");
    const root = client.rows("creed_documents").find((row) => row.id === "doc-root");
    expect(root?.title).toBe("Overview");
    expect(root?.path).toBe("old-folder/overview.md");
  });

  it("renames a folder and cascades descendant folder and file paths", async () => {
    const client = new FakeSupabaseClient();
    seedFolders(client);
    seedDocuments(client);

    const result = await updateSharedDocumentFolder(client, {
      id: "folder-root",
      name: "New Folder",
      actorUserId: "user-1",
    });

    if (!result.ok) throw new Error(result.error);
    expect(result.value.name).toBe("New Folder");
    expect(result.value.slug).toBe("new-folder");
    expect(result.value.path).toBe("new-folder");

    const folders = client.rows("creed_document_folders");
    expect(folders.find((row) => row.id === "folder-child")?.slug).toBe("new-folder-child");
    expect(folders.find((row) => row.id === "folder-child")?.path).toBe("new-folder/child");

    const documents = client.rows("creed_documents");
    expect(documents.find((row) => row.id === "doc-root")?.slug).toBe("new-folder-overview");
    expect(documents.find((row) => row.id === "doc-root")?.path).toBe("new-folder/overview.md");
    expect(documents.find((row) => row.id === "doc-root")?.github_path).toBe("new-folder/overview.md");
    expect(documents.find((row) => row.id === "doc-child")?.slug).toBe("new-folder-child-brief");
    expect(documents.find((row) => row.id === "doc-child")?.path).toBe("new-folder/child/brief.md");
    expect(documents.find((row) => row.id === "doc-child")?.sync_status).toBe("local-ahead");
  });

  it("rejects a folder rename that would collide before mutating rows", async () => {
    const client = new FakeSupabaseClient();
    seedFolders(client);
    seedDocuments(client);
    client.seed("creed_document_folders", [
      ...client.rows("creed_document_folders"),
      {
        id: "folder-existing",
        slug: "new-folder",
        name: "New Folder",
        path: "new-folder",
        parent_id: null,
        archived_at: null,
        updated_at: new Date().toISOString(),
      },
    ]);

    const result = await updateSharedDocumentFolder(client, {
      id: "folder-root",
      name: "New Folder",
      actorUserId: "user-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("conflict");
    expect(client.rows("creed_document_folders").find((row) => row.id === "folder-root")?.path).toBe(
      "old-folder"
    );
    expect(client.rows("creed_documents").find((row) => row.id === "doc-root")?.path).toBe(
      "old-folder/overview.md"
    );
  });
});
