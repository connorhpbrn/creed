"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CONTACT_MAILTO } from "@/lib/branding";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquareIcon,
  type MessageSquareIconHandle,
} from "@/components/ui/message-square";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 10_000;
const DRAFT_STORAGE_KEY = "creed:feedback-draft";

export function FeedbackMenuItem() {
  // Hydrate the draft from localStorage so closing the menu (or even
  // navigating between routes) keeps whatever the user already typed.
  // Only a hard refresh / explicit submit / manual delete clears it.
  const [content, setContent] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const iconRef = useRef<MessageSquareIconHandle | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (content) {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, content);
      } else {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {
      // Storage may be disabled (private mode, quota); fail silently.
    }
  }, [content]);

  const trimmed = content.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setStatus("idle");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          sourceUrl:
            typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Couldn't send feedback.");
      }
      setStatus("sent");
      setContent("");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Couldn't send feedback."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  }

  useEffect(() => {
    if (status !== "sent") return;
    const timer = setTimeout(() => setStatus("idle"), 2400);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        onMouseEnter={() => iconRef.current?.startAnimation()}
        onMouseLeave={() => iconRef.current?.stopAnimation()}
        className={cn(
          // Match the AnimatedMenuIconItem rows: same padding, radius, gap, font.
          "group/feedback gap-1.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] focus:bg-[var(--creed-surface-raised)] data-[state=open]:bg-[var(--creed-surface-raised)]",
          // Hide the trailing ChevronRight baked into DropdownMenuSubTrigger.
          "[&>svg:last-of-type]:hidden"
        )}
      >
        <MessageSquareIcon
          ref={iconRef}
          size={14}
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none"
        />
        <span className="flex-1 text-left">Feedback</span>
        <ChevronLeft
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[var(--creed-text-tertiary)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "group-hover/feedback:rotate-180 group-data-[state=open]/feedback:rotate-180"
          )}
        />
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          // Mirror the perceived vertical gap between the profile dropdown
          // and its trigger button. alignOffset 0 lines the panel's top edge
          // up with the top of the Feedback row.
          sideOffset={14}
          alignOffset={0}
          className={cn(
            "relative w-[320px] border-[var(--creed-border)] bg-[var(--creed-surface)] p-0",
            // Bridging pseudo spans the sideOffset gap so the cursor can
            // travel from the row into the panel without dismissing it.
            "before:pointer-events-auto before:absolute before:-left-4 before:top-0 before:bottom-0 before:w-4 before:content-['']"
          )}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="p-2.5">
            <Textarea
              value={content}
              onChange={(event) =>
                setContent(event.target.value.slice(0, MAX_LENGTH))
              }
              onKeyDown={handleKeyDown}
              placeholder="Have an idea or found a bug? Tell us…"
              rows={4}
              disabled={submitting || status === "sent"}
              className="min-h-[96px] resize-none rounded-[9px] border-[var(--creed-border)] bg-transparent px-3 py-2.5 text-[13px] leading-5 placeholder:text-[var(--creed-text-tertiary)]"
            />
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <AnimatePresence mode="wait" initial={false}>
                {status === "sent" ? (
                  <motion.span
                    key="sent"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="text-[12px] font-medium text-[var(--creed-success,#059669)]"
                  >
                    Thanks, feedback sent.
                  </motion.span>
                ) : status === "error" ? (
                  <motion.span
                    key="error"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="truncate text-[12px] font-medium text-[var(--creed-danger,#DC2626)]"
                    title={errorMessage ?? undefined}
                  >
                    {errorMessage ?? "Couldn't send."}
                  </motion.span>
                ) : (
                  <motion.span
                    key="hint"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="text-[12px] text-[var(--creed-text-tertiary)]"
                  >
                    Need help?{" "}
                    <a
                      href={CONTACT_MAILTO}
                      className="font-medium text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
                    >
                      Contact us
                    </a>{" "}
                    or{" "}
                    <Link
                      href="/docs"
                      className="font-medium text-[#2563EB] transition-colors hover:text-[#1D4ED8]"
                    >
                      see docs
                    </Link>
                    .
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void submit();
                }}
                disabled={!canSubmit}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                  canSubmit
                    ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                    : "bg-[var(--creed-surface-raised)] text-[var(--creed-text-tertiary)]"
                )}
              >
                {submitting ? "Sending…" : status === "sent" ? "Sent" : "Send"}
              </button>
            </div>
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
