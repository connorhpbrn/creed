"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type Person = { name?: string; avatarUrl?: string; initials: string };

// One squircle profile avatar with an initials fallback, mirroring the shell/
// roster avatar pattern (no-referrer, unoptimized, error falls back to initials).
function PersonAvatar({ person, label }: { person: Person; label: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(person.avatarUrl) && !failed;
  return (
    <Avatar className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--creed-border)] bg-[var(--creed-surface-raised)] after:rounded-lg">
      {showImage && person.avatarUrl ? (
        <Image
          key={person.avatarUrl}
          src={person.avatarUrl}
          alt={label}
          fill
          className="rounded-lg object-cover"
          referrerPolicy="no-referrer"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <AvatarFallback className="bg-transparent text-[14px] font-medium text-[var(--creed-text-secondary)]">
          {person.initials}
        </AvatarFallback>
      )}
    </Avatar>
  );
}

// The accept / reject action for a valid, signed-in invite. Styled to match the
// MCP consent screen (/authorize): avatars of the inviter and you joined by a
// send glyph, then a secondary Reject (left) and a blue Accept (right).
export function InviteAcceptCard({
  token,
  companyName,
  role,
  inviter,
  you,
}: {
  token: string;
  companyName: string;
  role: "admin" | "member";
  inviter: Person;
  you: { avatarUrl?: string; initials: string; email: string };
}) {
  const router = useRouter();
  const [action, setAction] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = action !== null;

  async function accept() {
    setAction("accept");
    setError(null);
    try {
      const response = await fetch("/api/app/company/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not accept the invite.");
        toast.error(data.error ?? "Could not accept the invite.");
        setAction(null);
        return;
      }
      toast.success(`You joined ${companyName}.`);
      router.push("/file");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setAction(null);
    }
  }

  async function decline() {
    setAction("decline");
    setError(null);
    try {
      const response = await fetch("/api/app/company/invites/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not decline the invite.");
        toast.error(data.error ?? "Could not decline the invite.");
        setAction(null);
        return;
      }
      toast.success("Invite declined.");
      router.push("/file");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setAction(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-center gap-6">
        <PersonAvatar person={inviter} label={inviter.name ?? "The person who invited you"} />
        <Send className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]" />
        <PersonAvatar person={{ initials: you.initials, avatarUrl: you.avatarUrl }} label="You" />
      </div>

      <h1 className="mt-6 text-[18px] font-medium text-[var(--creed-text-primary)]">
        Join {companyName}
      </h1>
      <p className="mt-3 text-[14px] leading-7 text-[var(--creed-text-secondary)]">
        {inviter.name ?? "A teammate"} invited you to the {companyName} Creed as{" "}
        {role === "admin" ? "an admin" : "a member"}. It is the shared context file this company&apos;s AI
        agents read before they work.
      </p>
      <p className="mt-2 text-[13px] text-[var(--creed-text-tertiary)]">Signed in as {you.email}</p>

      <div className="mt-6 flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          className="h-9 flex-1 rounded-md"
          onClick={decline}
          disabled={busy}
        >
          {action === "decline" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Reject"}
        </Button>
        <Button
          type="button"
          className="h-9 flex-1 rounded-md bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)]"
          onClick={accept}
          disabled={busy}
        >
          {action === "accept" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Accept"}
        </Button>
      </div>

      {error ? <p className="mt-3 text-[13px] text-[var(--creed-danger)]">{error}</p> : null}
    </div>
  );
}
