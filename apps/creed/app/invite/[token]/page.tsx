import { redirect } from "next/navigation";
import Link from "next/link";
import { CreedWordmark } from "@/components/creed/brand";
import { InviteAcceptCard } from "@/components/creed/invite-accept-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { resolveInviteByToken } from "@/lib/company-invites";
import { getUserName, getAvatarUrl, getAvatarInitials } from "@/lib/creed-backend";

// Company invite landing. Marketing-chrome-free, styled to match the MCP consent
// screen (/authorize): wordmark above a borderless, centered card. Resolves the
// invite by its raw token on the server:
//   - no/expired/revoked invite -> a calm one-line message.
//   - signed out                -> bounce to /login with a return path.
//   - signed in, email matches  -> the accept card (Reject / Accept).
//   - signed in, email differs  -> tell them which email it was sent to.
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--creed-background)] text-[var(--creed-text-primary)]">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16">
        <CreedWordmark className="mb-10 h-[20px]" />
        <div className="w-full rounded-[var(--radius-xl)] bg-[var(--creed-surface)] p-7 text-center">
          {children}
        </div>
      </div>
    </div>
  );
}

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="text-[18px] font-medium text-[var(--creed-text-primary)]">{title}</h1>
      <p className="mt-3 text-[14px] leading-7 text-[var(--creed-text-secondary)]">{body}</p>
      {children}
    </>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <Message title="Invites unavailable" body="Invites are unavailable right now. Please try again later." />
      </Shell>
    );
  }

  const resolved = await resolveInviteByToken(token);
  if (!resolved || resolved.invite.status !== "pending") {
    return (
      <Shell>
        <Message
          title="This invite is no longer active"
          body="The link may have been used, revoked, or expired. Ask whoever invited you to send a new one."
        />
      </Shell>
    );
  }

  if (resolved.expired) {
    return (
      <Shell>
        <Message
          title="This invite has expired"
          body="Invites last 7 days. Ask whoever invited you to send a fresh link."
        />
      </Shell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Return here after signing in / creating an account.
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const userEmail = user.email?.trim().toLowerCase() ?? "";
  if (userEmail !== resolved.invite.email.trim().toLowerCase()) {
    return (
      <Shell>
        <Message
          title="This invite is for a different email"
          body={`It was sent to ${resolved.invite.email}. Sign in with that email to accept it, or ask for a new invite to ${userEmail}.`}
        >
          <Link
            href="/file"
            className="mt-5 inline-block text-[14px] text-[var(--creed-text-secondary)] underline underline-offset-2 hover:text-[var(--creed-text-primary)]"
          >
            Go to your Creed
          </Link>
        </Message>
      </Shell>
    );
  }

  const youName = getUserName(user);

  return (
    <Shell>
      <InviteAcceptCard
        token={token}
        companyName={resolved.companyName}
        role={resolved.invite.role}
        inviter={
          resolved.inviter ?? { name: "A teammate", initials: getAvatarInitials("A teammate"), avatarUrl: undefined }
        }
        you={{ avatarUrl: getAvatarUrl(user), initials: getAvatarInitials(youName), email: user.email ?? "" }}
      />
    </Shell>
  );
}
