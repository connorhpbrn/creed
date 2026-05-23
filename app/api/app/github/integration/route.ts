import { NextResponse } from "next/server";
import { clearGitHubIntegration, upsertGitHubIntegration } from "@/lib/creed-backend";
import { getGitHubViewer } from "@/lib/github";
import { requireAuthenticatedUser } from "@/lib/github-version-control";
import { recordAuditEvent } from "@/lib/audit-log";

type PersistBody = {
  providerToken?: string;
  providerRefreshToken?: string | null;
  tokenExpiresAt?: string | null;
};

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAuthenticatedUser();
    const body = (await request.json()) as PersistBody;
    const providerToken = body.providerToken?.trim();

    if (!providerToken || providerToken.length > 500) {
      return NextResponse.json({ error: "Missing GitHub provider token." }, { status: 400 });
    }

    const viewer = await getGitHubViewer(providerToken);
    if (!viewer) {
      return NextResponse.json({ error: "Could not validate GitHub token." }, { status: 400 });
    }

    // Identity is derived from the verified token only — never from the request body.
    await upsertGitHubIntegration(supabase, user.id, {
      status: "connected",
      providerAccountId: String(viewer.id),
      providerLogin: viewer.login,
      accessToken: providerToken,
      refreshToken: body.providerRefreshToken?.trim() || null,
      tokenExpiresAt: body.tokenExpiresAt?.trim() || null,
    });

    void recordAuditEvent({
      userId: user.id,
      action: "github.connected",
      request,
      metadata: { providerLogin: viewer.login, providerAccountId: String(viewer.id) },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not persist GitHub integration.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireAuthenticatedUser();
    await clearGitHubIntegration(supabase, user.id);
    void recordAuditEvent({
      userId: user.id,
      action: "github.disconnected",
      request,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not disconnect GitHub.";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 400 }
    );
  }
}
