import { createHash } from "node:crypto";
import "server-only";

type GitHubErrorPayload = {
  message?: string;
  error?: string;
  error_description?: string;
};

type GitHubTokenRefreshPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  default_branch: string;
  private: boolean;
};

export type GitHubBranch = {
  name: string;
};

export type GitHubFileSnapshot = {
  sha: string;
  content: string;
  contentHash: string;
  commitMessage?: string;
  committedAt?: string;
};

export type GitHubPushResult = {
  sha: string;
  message?: string;
  committedAt?: string;
  contentHash: string;
};

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function readJson<T>(response: Response) {
  return (await response.json()) as T;
}

function getGitHubOAuthClientId() {
  return process.env.GITHUB_OAUTH_CLIENT_ID?.trim() ?? "";
}

function getGitHubOAuthClientSecret() {
  return process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() ?? "";
}

export function isGitHubTokenRefreshConfigured() {
  return Boolean(getGitHubOAuthClientId() && getGitHubOAuthClientSecret());
}

async function githubRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit & { allowNotFound?: boolean }
) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "Creed",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (init?.allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    let message = "GitHub request failed.";
    try {
      const payload = await readJson<GitHubErrorPayload>(response);
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Ignore parse failures and keep the generic message.
    }

    throw new Error(message);
  }

  return readJson<T>(response);
}

export async function listGitHubRepos(accessToken: string) {
  const repos =
    (await githubRequest<GitHubRepo[]>(
      accessToken,
      "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member"
    )) ?? [];

  return repos.sort((left, right) => left.full_name.localeCompare(right.full_name));
}

export async function getGitHubViewer(accessToken: string) {
  return githubRequest<{ id: number; login: string }>(accessToken, "/user");
}

export async function listGitHubBranches(
  accessToken: string,
  owner: string,
  repo: string
) {
  const branches =
    (await githubRequest<GitHubBranch[]>(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`
    )) ?? [];

  return branches.sort((left, right) => left.name.localeCompare(right.name));
}

export async function getGitHubFileSnapshot(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
) {
  const file = await githubRequest<{
    sha: string;
    content?: string;
    encoding?: string;
  }>(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    { allowNotFound: true }
  );

  if (!file) {
    return null;
  }

  const rawContent =
    file.encoding === "base64" && typeof file.content === "string"
      ? Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8")
      : "";

  const commits =
    (await githubRequest<
      Array<{
        sha: string;
        commit?: {
          message?: string;
          committer?: {
            date?: string;
          };
        };
      }>
    >(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}&per_page=1`,
      { allowNotFound: true }
    )) ?? [];

  const latestCommit = commits[0];

  return {
    sha: file.sha,
    content: rawContent,
    contentHash: hashContent(rawContent),
    commitMessage: latestCommit?.commit?.message,
    committedAt: latestCommit?.commit?.committer?.date,
  } satisfies GitHubFileSnapshot;
}

export async function pushGitHubFile(args: {
  accessToken: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  message: string;
  content: string;
  currentSha?: string | null;
}) {
  const payload = await githubRequest<{
    commit?: {
      sha: string;
      commit?: {
        message?: string;
        committer?: {
          date?: string;
        };
      };
    };
    content?: {
      sha?: string;
    };
  }>(
    args.accessToken,
    `/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/contents/${encodePath(args.path)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: args.message,
        branch: args.branch,
        content: Buffer.from(args.content, "utf8").toString("base64"),
        ...(args.currentSha ? { sha: args.currentSha } : {}),
      }),
    }
  );

  if (!payload) {
    throw new Error("GitHub did not return a commit payload.");
  }

  return {
    sha: payload.commit?.sha ?? payload.content?.sha ?? "",
    message: payload.commit?.commit?.message ?? args.message,
    committedAt: payload.commit?.commit?.committer?.date,
    contentHash: hashContent(args.content),
  } satisfies GitHubPushResult;
}

export async function refreshGitHubAccessToken(refreshToken: string) {
  if (!isGitHubTokenRefreshConfigured()) {
    throw new Error("GitHub token refresh is not configured.");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Creed",
    },
    body: new URLSearchParams({
      client_id: getGitHubOAuthClientId(),
      client_secret: getGitHubOAuthClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  const payload = await readJson<GitHubTokenRefreshPayload>(response);

  if (!response.ok || payload.error || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        payload.error_description ||
        "Could not refresh GitHub access token."
    );
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt:
      typeof payload.expires_in === "number"
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : null,
  };
}
