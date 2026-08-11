"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@creed/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@creed/ui/dropdown-menu";
import { Button } from "@creed/ui/button";
import { Input } from "@creed/ui/input";
import {
  EditableProfileAvatar,
  ProfileAvatar,
} from "@/components/creed/profile-avatar";
import {
  useCreedActions,
  useCreedStateSelector,
} from "@/components/creed/creed-provider";
import {
  notifySettingsCreditsChanged,
  peekSettingsCredits,
} from "@/components/creed/settings-preload";
import { SkeletonBar } from "@/components/creed/loading-skeleton";
import { GRANT_MONTHLY_USD } from "@creed/cloud/lib/ai/credit-config";

type CreditsHomeOption = {
  id: string;
  name: string;
  type: "personal" | "shared";
  avatarUrl?: string | null;
};

type CreditsHomePayload = {
  homeCreedId?: string;
  creeds?: CreditsHomeOption[];
  credits?: {
    grantedUsd?: number;
    allowanceUsd?: number;
    allowanceResets?: boolean;
  };
};

function ownedOptionsFromState(
  creeds: Array<{
    id: string;
    name: string;
    type: "personal" | "shared";
    role: string;
    avatarUrl?: string;
  }>,
): CreditsHomeOption[] {
  return creeds
    .filter((creed) => creed.role === "owner")
    .map((creed) => ({
      id: creed.id,
      name: creed.name,
      type: creed.type,
      avatarUrl: creed.avatarUrl ?? null,
    }));
}

function pickHomeId(
  options: CreditsHomeOption[],
  preferredIds: Array<string | null | undefined>,
) {
  for (const id of preferredIds) {
    if (id && options.some((creed) => creed.id === id)) return id;
  }
  return (
    options.find((creed) => creed.type === "personal")?.id ??
    options[0]?.id ??
    ""
  );
}

export function AccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { setDisplayName, setProfileAvatar, deleteAccount } = useCreedActions();
  const user = useCreedStateSelector((s) => s.user, (a, b) => a === b);
  const creedId = useCreedStateSelector((s) => s.creedId, (a, b) => a === b);
  const creeds = useCreedStateSelector((s) => s.creeds, (a, b) => a === b);

  const seededOwned = useMemo(
    () => ownedOptionsFromState(creeds ?? []),
    [creeds],
  );

  const [nameDraft, setNameDraft] = useState(user.name);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteExpanded, setDeleteExpanded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [bonusRemainingUsd, setBonusRemainingUsd] = useState<number | null>(
    null,
  );
  const [bonusAllowanceUsd, setBonusAllowanceUsd] =
    useState<number>(GRANT_MONTHLY_USD);
  const [bonusResets, setBonusResets] = useState(true);
  const [bonusCreedId, setBonusCreedId] = useState<string>("");
  const [savedBonusCreedId, setSavedBonusCreedId] = useState<string>("");
  const [bonusOptions, setBonusOptions] = useState<CreditsHomeOption[]>([]);
  const [bonusBalanceLoading, setBonusBalanceLoading] = useState(false);
  const avatarPreview = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : undefined),
    [avatarFile],
  );
  const openedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    if (!open) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    setNameDraft(user.name);
    setAvatarFile(null);
    setSaving(false);
    setDeleting(false);
    setDeleteExpanded(false);
    setDeleteConfirm("");

    const cached = peekSettingsCredits();
    const seedHome = pickHomeId(seededOwned, [
      cached?.creditsHomeCreedId,
      creedId,
    ]);
    setBonusOptions(seededOwned);
    setBonusCreedId(seedHome);
    setSavedBonusCreedId(seedHome);
    // Remaining usually needs a fetch; /$5 can render immediately. If settings
    // already loaded the home Creed's wallet, reuse that remaining so the
    // skeleton does not flash.
    if (cached?.isCreditsHome && cached.allowanceResets) {
      const cachedAllowance =
        cached.allowanceUsd > 0 ? cached.allowanceUsd : GRANT_MONTHLY_USD;
      setBonusRemainingUsd(
        Math.min(Math.max(0, cached.grantedUsd), cachedAllowance),
      );
      setBonusAllowanceUsd(cachedAllowance);
      setBonusResets(true);
    } else {
      setBonusRemainingUsd(null);
      setBonusAllowanceUsd(GRANT_MONTHLY_USD);
      setBonusResets(true);
    }
    setBonusBalanceLoading(true);

    void fetch("/api/app/credits/home", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CreditsHomePayload | null) => {
        if (!data) {
          setBonusRemainingUsd((prev) => prev ?? 0);
          return;
        }
        const options = data.creeds?.length ? data.creeds : seededOwned;
        const homeId = pickHomeId(options, [
          data.homeCreedId,
          cached?.creditsHomeCreedId,
          creedId,
        ]);
        setBonusOptions(options);
        setBonusCreedId(homeId);
        setSavedBonusCreedId(homeId);
        const credits = data.credits;
        if (!credits) {
          setBonusRemainingUsd(0);
          setBonusAllowanceUsd(0);
          setBonusResets(false);
          return;
        }
        const resets = Boolean(credits.allowanceResets);
        const allowanceUsd =
          resets && credits.allowanceUsd && credits.allowanceUsd > 0
            ? credits.allowanceUsd
            : resets
              ? GRANT_MONTHLY_USD
              : 0;
        const remainingUsd = resets
          ? Math.min(Math.max(0, credits.grantedUsd ?? 0), allowanceUsd)
          : 0;
        setBonusRemainingUsd(remainingUsd);
        setBonusAllowanceUsd(allowanceUsd);
        setBonusResets(resets);
      })
      .catch(() => {
        setBonusRemainingUsd((prev) => prev ?? 0);
      })
      .finally(() => setBonusBalanceLoading(false));
  }, [open, user.name, seededOwned, creedId]);

  const trimmedName = nameDraft.trim();
  const nameDirty = trimmedName.length > 0 && trimmedName !== user.name;
  const avatarDirty = avatarFile !== null;
  const bonusDirty =
    Boolean(bonusCreedId) && bonusCreedId !== savedBonusCreedId;
  const dirty = nameDirty || avatarDirty || bonusDirty;
  const canSave = dirty && trimmedName.length > 0 && !saving && !deleting;
  const deleteReady =
    deleteConfirm.trim().toLowerCase() === user.email.trim().toLowerCase();
  const showBonusPicker = bonusOptions.length > 1;
  const selectedBonusCreed =
    bonusOptions.find((creed) => creed.id === bonusCreedId) ??
    bonusOptions[0] ??
    null;
  const showAllowance =
    bonusBalanceLoading || (bonusResets && bonusAllowanceUsd > 0);
  const allowanceDisplayUsd = bonusBalanceLoading
    ? GRANT_MONTHLY_USD
    : bonusAllowanceUsd;

  function close() {
    if (saving || deleting) return;
    onOpenChange(false);
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (nameDirty) {
        const ok = await setDisplayName(trimmedName);
        if (!ok) {
          toast.error("Could not update your name.");
          return;
        }
      }
      if (avatarFile) {
        const form = new FormData();
        form.set("scope", "personal");
        form.set("file", avatarFile);
        const response = await fetch("/api/app/profile/avatar", {
          method: "POST",
          body: form,
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          avatarUrl?: string;
        };
        if (!response.ok) {
          toast.error(data.error ?? "Could not save your picture.");
          return;
        }
        if (data.avatarUrl) {
          setProfileAvatar(data.avatarUrl, "personal");
        }
      }
      if (bonusDirty) {
        const res = await fetch("/api/app/credits/home", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creedId: bonusCreedId }),
        });
        const data = (await res.json().catch(() => ({}))) as CreditsHomePayload & {
          error?: string;
        };
        if (!res.ok) {
          toast.error(data.error ?? "Could not move your bonus credits.");
          return;
        }
        const nextHomeId = data.homeCreedId ?? bonusCreedId;
        setBonusCreedId(nextHomeId);
        setSavedBonusCreedId(nextHomeId);
        notifySettingsCreditsChanged();
      }
      toast.success("Account saved.");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!deleteReady || deleting) return;
    setDeleting(true);
    try {
      await deleteAccount();
      // Success navigates away via full page load; keep the spinner until then.
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete your account.",
      );
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(next);
      }}
    >
      <DialogContent
        aria-describedby="account-dialog-description"
        className="max-h-[calc(100dvh-2rem)] min-w-0 overflow-x-hidden overflow-y-auto rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription id="account-dialog-description">
            Your name, picture, and email across Creed.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--creed-border)] p-3 sm:p-4">
            <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">
              Profile
            </div>
            <div className="mt-3 grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3">
              <EditableProfileAvatar
                kind="person"
                name={trimmedName || user.name}
                initials={user.avatarInitials}
                avatarUrl={avatarPreview ?? user.avatarUrl}
                disabled={saving || deleting}
                size="input"
                onFile={setAvatarFile}
              />
              <Input
                value={nameDraft}
                disabled={saving || deleting}
                aria-label="Name"
                onChange={(event) => setNameDraft(event.target.value)}
                className="h-11 min-w-0 w-full rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[15px] sm:px-4"
              />
              <Input
                value={user.email}
                readOnly
                aria-label="Email"
                className="col-span-2 h-11 min-w-0 w-full rounded-xl border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[15px] text-[var(--creed-text-secondary)] sm:px-4"
              />
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-xl)] border border-[var(--creed-border)] p-3 sm:p-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 shrink">
                <div className="text-[14px] font-medium text-[var(--creed-text-primary)]">
                  Bonus credits
                </div>
                <div className="mt-0.5 flex h-[19.5px] items-center text-[13px] font-medium tabular-nums text-[var(--creed-text-primary)]">
                  {bonusRemainingUsd == null ? (
                    <span className="relative inline-flex">
                      <span className="invisible" aria-hidden>
                        $0.00
                      </span>
                      <SkeletonBar className="absolute inset-y-[3px] left-0 right-0 h-[13px]" />
                    </span>
                  ) : (
                    <span>${bonusRemainingUsd.toFixed(2)}</span>
                  )}
                  {showAllowance ? (
                    <span className="text-[var(--creed-text-secondary)]">
                      /${allowanceDisplayUsd.toFixed(2)}
                    </span>
                  ) : null}
                </div>
              </div>
              {selectedBonusCreed ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={saving || deleting || !showBonusPicker}
                      className="inline-flex h-9 min-w-0 max-w-[9.5rem] shrink items-center justify-between gap-2 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] py-0 pl-1.5 pr-2.5 text-[13px] text-[var(--creed-text-primary)] transition-colors duration-150 hover:bg-[var(--creed-surface-raised)] aria-expanded:bg-[var(--creed-surface-raised)] disabled:pointer-events-none disabled:opacity-60 sm:max-w-[14rem] sm:pr-3"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ProfileAvatar
                          kind={
                            selectedBonusCreed.type === "shared"
                              ? "shared"
                              : "person"
                          }
                          name={selectedBonusCreed.name}
                          avatarUrl={selectedBonusCreed.avatarUrl ?? undefined}
                          size="sm"
                        />
                        <span className="min-w-0 truncate">
                          {selectedBonusCreed.name}
                        </span>
                      </span>
                      <ChevronDown
                        className="h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)]"
                        strokeWidth={2}
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="min-w-[max(var(--radix-dropdown-menu-trigger-width),12rem)] rounded-lg border-[var(--creed-border)] bg-[var(--creed-surface)] p-1"
                  >
                    {bonusOptions.map((creed) => {
                      const selected = creed.id === bonusCreedId;
                      return (
                        <DropdownMenuItem
                          key={creed.id}
                          disabled={saving}
                          onSelect={() => setBonusCreedId(creed.id)}
                          className="flex items-center justify-between gap-2.5 rounded-sm py-1.5 pl-1.5 pr-2.5 text-[13px]"
                        >
                          <span className="flex min-w-0 items-center gap-2 text-[var(--creed-text-primary)]">
                            <ProfileAvatar
                              kind={
                                creed.type === "shared" ? "shared" : "person"
                              }
                              name={creed.name}
                              avatarUrl={creed.avatarUrl ?? undefined}
                              size="sm"
                            />
                            <span className="min-w-0 truncate">{creed.name}</span>
                          </span>
                          {selected ? (
                            <Check
                              className="h-3.5 w-3.5 shrink-0 text-white!"
                              strokeWidth={1.8}
                            />
                          ) : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div
                  aria-hidden
                  className="inline-flex h-9 min-w-0 max-w-[9.5rem] shrink items-center gap-2 rounded-md border border-[var(--creed-border)] bg-[var(--creed-surface)] py-0 pl-1.5 pr-2.5 sm:max-w-[14rem] sm:pr-3"
                >
                  <SkeletonBar className="size-6 shrink-0 rounded-[8px]" />
                  <SkeletonBar className="h-[9px] w-16" />
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-xl)] border border-[#FECACA] bg-[#FEF2F2] p-3 sm:p-4 dark:border-[#7F1D1D]/40 dark:bg-[#3F1212]/30">
            {!deleteExpanded ? (
              <div className="flex min-w-0 items-center justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-[#DC2626]">
                    Delete account
                  </div>
                  <div className="mt-1 hidden truncate text-[13px] leading-5 text-[#DC2626]/90 sm:block">
                    Deletes your account and every Creed you own.
                  </div>
                </div>
                <Button
                  type="button"
                  className="shrink-0 rounded-md bg-[#DC2626] px-3 text-white hover:bg-[#B91C1C] hover:text-white"
                  disabled={saving || deleting}
                  onClick={() => setDeleteExpanded(true)}
                >
                  Delete
                </Button>
              </div>
            ) : (
              <div className="min-w-0 space-y-3">
                <div className="flex items-start gap-2 text-[#DC2626]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="min-w-0 text-[13px] leading-5">
                    Type your email to confirm. This cannot be undone.
                  </p>
                </div>
                <Input
                  value={deleteConfirm}
                  disabled={deleting}
                  autoComplete="off"
                  placeholder={user.email}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  className="h-11 min-w-0 w-full rounded-xl border-[#DC2626] bg-[var(--creed-surface)] px-3 text-[15px] focus-visible:border-[#DC2626] focus-visible:ring-[#DC2626]/20 sm:px-4"
                />
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md border-[var(--creed-border)] bg-[var(--creed-surface-raised)]"
                    disabled={deleting}
                    onClick={() => {
                      setDeleteExpanded(false);
                      setDeleteConfirm("");
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    className="min-w-0 rounded-md bg-[#DC2626] text-white hover:bg-[#B91C1C]"
                    disabled={!deleteReady || deleting}
                    onClick={() => void handleDeleteAccount()}
                  >
                    {deleting ? "Deleting" : "Delete account"}
                    {deleting ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="rounded-md"
            disabled={saving || deleting}
            onClick={close}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-md bg-[var(--creed-accent)] text-white hover:bg-[var(--creed-accent-hover)] disabled:bg-[var(--creed-border-strong)] disabled:text-[var(--creed-text-tertiary)]"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving" : "Save"}
            {saving ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
