"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import { Button } from "@creed/ui/button";
import { Input } from "@creed/ui/input";
import { EditableProfileAvatar } from "@/components/creed/profile-avatar";
import {
  CREED_NAME_MAX_LENGTH,
  defaultNewCreedName,
  type NewCreedType,
} from "@creed/core/creed-creation";
import { cn } from "@creed/ui/utils";
import { useCreedEdition } from "@/components/creed/edition-provider";

type CreatedCreed = {
  id: string;
  type: NewCreedType;
  name: string;
  role: "owner";
  needsSetup: boolean;
};

export function NewCreedDialog({
  open,
  onOpenChange,
  accountName,
  initials,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountName: string;
  initials: string;
  onCreated: (creed: CreatedCreed) => Promise<void>;
}) {
  const supportsSharedCreeds = useCreedEdition().capabilities.sharedCreeds;
  const [type, setType] = useState<NewCreedType>("personal");
  const [name, setName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : undefined),
    [avatarFile],
  );

  useEffect(() => {
    return () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    };
  }, [avatarUrl]);

  useEffect(() => {
    if (!open) return;
    setType("personal");
    setName(defaultNewCreedName("personal", accountName));
    setAvatarFile(null);
    setSubmitting(false);
    setError(null);
  }, [accountName, open]);

  function selectType(next: NewCreedType) {
    if (type === next) return;
    const previousDefault = defaultNewCreedName(type, accountName);
    if (name.trim() === previousDefault) {
      setName(defaultNewCreedName(next, accountName));
    }
    setType(next);
  }

  const trimmedName = name.trim();
  const valid =
    trimmedName.length > 0 && trimmedName.length <= CREED_NAME_MAX_LENGTH;
  const accent = type === "personal" ? "#2563EB" : "#D97706";

  async function createCreed() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/app/creeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, type }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        creed?: CreatedCreed;
        error?: string;
      };
      if (!response.ok || !payload.creed) {
        throw new Error(payload.error ?? "Could not create this Creed.");
      }

      if (avatarFile) {
        const form = new FormData();
        form.set("scope", "creed");
        form.set("creedId", payload.creed.id);
        form.set("file", avatarFile);
        const avatarResponse = await fetch("/api/app/profile/avatar", {
          method: "POST",
          body: form,
        });
        if (!avatarResponse.ok) {
          const avatarPayload = (await avatarResponse
            .json()
            .catch(() => ({}))) as { error?: string };
          toast.error(
            avatarPayload.error ??
              "The Creed was created, but its picture could not be saved.",
          );
        }
      }

      await onCreated(payload.creed);
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create this Creed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent
        aria-describedby="new-creed-description"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)] sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle>New Creed</DialogTitle>
          <DialogDescription id="new-creed-description">
            {supportsSharedCreeds
              ? "Private for you, or shared with a group."
              : "Choose a name and picture for your Personal Creed."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void createCreed();
          }}
        >
          {supportsSharedCreeds ? <fieldset disabled={submitting}>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    value: "personal",
                    label: "Personal",
                    color: "#2563EB",
                  },
                  {
                    value: "shared",
                    label: "Shared",
                    color: "#D97706",
                  },
                ] as const
              ).map(({ value, label, color }) => {
                const selected = type === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectType(value)}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-lg border bg-[var(--creed-surface)] text-center text-sm font-medium outline-none transition-colors focus:outline-none focus-visible:outline-none",
                      selected
                        ? "border-[var(--tone)] text-[var(--tone)] shadow-[inset_0_0_0_1px_var(--tone)]"
                        : "border-[var(--creed-border)] text-[var(--creed-text-secondary)] hover:border-[var(--creed-border-strong)] hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
                    )}
                    style={
                      selected
                        ? ({
                            ["--tone" as string]: color,
                            background: `linear-gradient(135deg, color-mix(in srgb, ${color} 10%, transparent) 0%, color-mix(in srgb, ${color} 15%, transparent) 100%)`,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset> : null}

          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3">
            <EditableProfileAvatar
              kind={type === "shared" ? "shared" : "person"}
              name={trimmedName || "New Creed"}
              initials={initials}
              avatarUrl={avatarUrl}
              disabled={submitting}
              size="input"
              onFile={setAvatarFile}
            />
            <Input
              id="new-creed-name"
              autoFocus
              autoComplete="off"
              maxLength={CREED_NAME_MAX_LENGTH}
              value={name}
              disabled={submitting}
              aria-label="Creed name"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? "new-creed-error" : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              className="h-11 rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-4"
            />
          </div>

          {error ? (
            <p
              id="new-creed-error"
              role="alert"
              className="text-[12px] text-[#DC2626]"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="rounded-md"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!valid || submitting}
              className="rounded-md text-white hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {submitting ? "Creating" : "Create"}
              {submitting ? (
                <LoaderCircle
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
