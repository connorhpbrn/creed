export type EditionSharedGitHubIntegration = {
  status: "connected" | "not-connected" | "disconnected";
  providerAccountId: string | null;
  providerLogin: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
};

export type EditionSharedVersionControlRow = {
  repo_owner: string | null;
  repo_name: string | null;
  branch: string | null;
  path: string | null;
  last_remote_sha: string | null;
  last_remote_message: string | null;
  last_remote_committed_at: string | null;
  last_synced_content_hash: string | null;
  sync_status: string | null;
};

export type EditionSharedVersionControlPatch = {
  lastRemoteSha?: string | null;
  lastRemoteMessage?: string | null;
  lastRemoteCommittedAt?: string | null;
  lastSyncedContentHash?: string | null;
  syncStatus?: string;
};
