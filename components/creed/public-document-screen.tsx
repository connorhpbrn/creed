"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Contrast,
  Copy,
  Download,
  FileText,
  History,
  LoaderCircle,
  MessageSquare,
  SlidersHorizontal,
  UserCircle,
  X,
} from "@/components/ui/phosphor-icons";
import { Textarea } from "@/components/ui/textarea";
import { htmlToText } from "@/components/creed/inline-proposal-diff";
import { RichTextEditor } from "@/components/creed/rich-text-editor";
import { useTheme } from "@/components/creed/theme-provider";
import type {
  DocumentActivityEvent,
  DocumentComment,
} from "@/lib/document-collaboration";
import { accentColorMap } from "@/lib/creed-data";
import {
  documentSectionsToMarkdown,
  parseDocumentSections,
} from "@/lib/document-sections";
import {
  EDITOR_FONT_SCALE,
  EDITOR_WIDTH_PX,
  setEditorView,
  useEditorView,
  type EditorTextScale,
  type EditorWidth,
} from "@/lib/editor-view";
import type { SharedDocument } from "@/lib/shared-documents";
import { sectionDepth } from "@/lib/section-hierarchy";
import { cn } from "@/lib/utils";

type PublicDocumentScreenProps = {
  shareId: string;
  document: SharedDocument;
  initialComments: DocumentComment[];
  initialActivity: DocumentActivityEvent[];
};

type PublicPanel = "comments" | "activity" | "view" | null;

const PUBLIC_COMMENT_NAME_STORAGE_KEY = "creed:public-comment-name";
const PUBLIC_COMMENT_CLIENT_ID_STORAGE_KEY = "creed:public-comment-client-id";

function formatRelativeTime(timestamp?: string) {
  if (!timestamp) return "just now";

  const deltaMs = Math.max(Date.now() - new Date(timestamp).getTime(), 0);
  const minutes = Math.round(deltaMs / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;

  const weeks = Math.round(days / 7);
  return weeks === 1 ? "1w ago" : `${weeks}w ago`;
}

function fileBaseName(path: string, fallback: string) {
  return path.split("/").pop()?.replace(/\.[^.]+$/, "") || fallback;
}

function createPublicCommentClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `public-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function PublicDocumentScreen({
  shareId,
  document,
  initialComments,
  initialActivity,
}: PublicDocumentScreenProps) {
  const editorView = useEditorView();
  const sections = useMemo(() => parseDocumentSections(document.content), [document.content]);
  const markdown = useMemo(
    () => documentSectionsToMarkdown(sections, document.title),
    [document.title, sections]
  );
  const [panel, setPanel] = useState<PublicPanel>(null);
  const scrollRef = useRef<HTMLElement>(null);
  // Mobile-only bottom toolbar: reveal on scroll up, hide on scroll down.
  const [mobileBarVisible, setMobileBarVisible] = useState(true);
  const [comments, setComments] = useState(initialComments);
  const [activity, setActivity] = useState(initialActivity);
  const [commentName, setCommentName] = useState("");
  const [commentClientId, setCommentClientId] = useState("");
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyNamePromptCommentId, setReplyNamePromptCommentId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const rootComments = useMemo(
    () => comments.filter((comment) => !comment.parentId),
    [comments]
  );
  const repliesByParent = useMemo(() => {
    const map = new Map<string, DocumentComment[]>();
    for (const comment of comments) {
      if (!comment.parentId) continue;
      map.set(comment.parentId, [...(map.get(comment.parentId) ?? []), comment]);
    }
    return map;
  }, [comments]);

  useEffect(() => {
    try {
      setCommentName(window.localStorage.getItem(PUBLIC_COMMENT_NAME_STORAGE_KEY) ?? "");
      const existingClientId = window.localStorage.getItem(PUBLIC_COMMENT_CLIENT_ID_STORAGE_KEY);
      if (existingClientId) {
        setCommentClientId(existingClientId);
      } else {
        const nextClientId = createPublicCommentClientId();
        window.localStorage.setItem(PUBLIC_COMMENT_CLIENT_ID_STORAGE_KEY, nextClientId);
        setCommentClientId(nextClientId);
      }
    } catch {
      setCommentName("");
      setCommentClientId(createPublicCommentClientId());
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let lastY = el.scrollTop;
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = el.scrollTop;
        const delta = y - lastY;
        if (y <= 8) {
          setMobileBarVisible(true);
        } else if (delta > 6) {
          setMobileBarVisible(false);
        } else if (delta < -6) {
          setMobileBarVisible(true);
        }
        lastY = y;
        ticking = false;
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  function markActionComplete(key: string) {
    setCopiedAction(key);
    window.setTimeout(() => setCopiedAction(null), 1400);
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      markActionComplete("copy");
    } catch {
      toast.error("Could not copy the document.");
    }
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = document.path || `${document.slug}.md`;
    link.click();
    URL.revokeObjectURL(url);
    markActionComplete("download");
  }

  function exportPdf() {
    const previousTitle = window.document.title;
    window.document.title = `${fileBaseName(document.path, document.title)}.pdf`;
    markActionComplete("pdf");

    const restoreTitle = () => {
      window.document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.setTimeout(() => {
      window.print();
      window.setTimeout(restoreTitle, 1000);
    }, 120);
  }

  async function createPublicComment(input: {
    body: string;
    parentId?: string | null;
    referenceQuote?: string | null;
  }) {
    const name = commentName.trim();
    const body = input.body.trim();

    if (!name) {
      toast.error("Name is required.");
      return false;
    }
    if (!body) {
      toast.error("Comment is required.");
      return false;
    }

    try {
      const response = await fetch(
        `/api/public/documents/${encodeURIComponent(shareId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            clientId: commentClientId,
            body,
            parentId: input.parentId ?? null,
            referenceQuote: input.referenceQuote ?? null,
          }),
        }
      );
      const payload = (await response.json()) as {
        comment?: DocumentComment;
        activity?: DocumentActivityEvent[];
        error?: string;
      };
      const createdComment = payload.comment;

      if (!response.ok || !createdComment) {
        throw new Error(payload.error || "Could not add the comment.");
      }

      try {
        window.localStorage.setItem(PUBLIC_COMMENT_NAME_STORAGE_KEY, name);
      } catch {
        // Local persistence is helpful, but not required for commenting.
      }
      setComments((current) => [...current, createdComment]);
      setPanel("comments");
      setActiveCommentId(createdComment.id);
      if (payload.activity) setActivity(payload.activity);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the comment.");
      return false;
    }
  }

  async function createPublicCommentFromEditor(input: {
    quote: string;
    body: string;
  }) {
    const created = await createPublicComment({
      body: input.body,
      referenceQuote: input.quote || null,
    });

    if (!created) {
      throw new Error("Could not add the comment.");
    }
  }

  async function submitReply(parentId: string) {
    setSubmittingReplyId(parentId);
    const created = await createPublicComment({ body: replyBody, parentId });
    setSubmittingReplyId(null);
    if (created) {
      setReplyBody("");
      setReplyingTo(null);
      setReplyNamePromptCommentId(null);
    }
  }

  function openNameDialog() {
    setNameDraft(commentName);
    setNameDialogOpen(true);
  }

  async function savePublicName() {
    const nextName = nameDraft.trim();
    if (!nextName) {
      toast.error("Name is required.");
      return;
    }

    try {
      setSavingName(true);
      const response = await fetch(
        `/api/public/documents/${encodeURIComponent(shareId)}/comments`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: nextName,
            previousName: commentName || null,
            clientId: commentClientId,
          }),
        }
      );
      const payload = (await response.json()) as {
        comments?: DocumentComment[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Could not update your name.");
      }

      try {
        window.localStorage.setItem(PUBLIC_COMMENT_NAME_STORAGE_KEY, nextName);
      } catch {
        // Name still updates in memory if localStorage is unavailable.
      }
      setCommentName(nextName);
      if (payload.comments) setComments(payload.comments);
      setNameDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your name.");
    } finally {
      setSavingName(false);
    }
  }

  return (
    <div
      data-file-export-shell
      className={cn(
        "grid min-h-screen overflow-hidden bg-[var(--creed-surface)] text-[var(--creed-text-primary)]",
        panel ? "grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-[minmax(0,1fr)]"
      )}
    >
      <main
        ref={scrollRef}
        data-file-export-scroll
        className="h-screen min-w-0 overflow-y-auto bg-[var(--creed-surface)] creed-scrollbar"
      >
        <article
          data-file-export-content
          className="mx-auto px-4 py-8 pb-28 md:px-12 md:py-12 md:pb-32 xl:px-16"
          style={{
            maxWidth: EDITOR_WIDTH_PX[editorView.width],
            "--editor-font-scale": String(EDITOR_FONT_SCALE[editorView.textScale]),
          } as CSSProperties}
        >
          <div data-file-export-title>{document.title}</div>
          <header data-file-export-hidden className="mb-10 md:mb-14">
            <h1 className="font-heading text-[1.45rem] font-medium tracking-[0] text-[var(--creed-text-primary)] md:text-[1.8rem]">
              {document.title}
            </h1>
          </header>

          <div className="space-y-10 md:space-y-16">
            {sections.map((section) => {
              const depth = sectionDepth(section);
              const accent = accentColorMap[section.accent];
              const sectionText = htmlToText(section.content).toLocaleLowerCase();
              const sectionCommentAnchors = comments
                .filter((comment) => {
                  if (comment.status !== "open") return false;
                  const quote = comment.referenceQuote.trim();
                  return quote.length > 0 && sectionText.includes(quote.toLocaleLowerCase());
                })
                .map((comment) => ({
                  id: comment.id,
                  quote: comment.referenceQuote,
                  body: comment.body,
                  authorLabel: comment.authorLabel,
                  status: comment.status,
                }));
              const titleSizeClass =
                depth >= 2
                  ? "text-[13px] md:text-[14px]"
                  : depth === 1
                    ? "text-[14px] md:text-[15px]"
                    : "text-[16px] md:text-[18px]";
              const accentBarHeightClass = depth >= 2 ? "h-6" : depth === 1 ? "h-7" : "h-9";

              return (
                <section
                  key={section.id}
                  data-section-id={section.id}
                  className="scroll-mt-10"
                  style={depth > 0 ? { paddingLeft: depth * 18 } : undefined}
                >
                  <div className="mb-6 flex items-center gap-3">
                    <span
                      className={cn("inline-block w-[3px] rounded-full", accentBarHeightClass)}
                      style={{ backgroundColor: accent }}
                    />
                    <h2
                      className={cn("font-medium leading-none tracking-[0]", titleSizeClass)}
                      style={{ color: accent }}
                    >
                      {section.name}
                    </h2>
                  </div>
                  <RichTextEditor
                    sectionId={section.id}
                    content={section.content}
                    readOnly
                    accentColor={accent}
                    onChange={() => {}}
                    enableReferences={false}
                    allowReadOnlyComments
                    commentAuthorName={commentName}
                    onCommentAuthorNameChange={setCommentName}
                    requireCommentAuthorName
                    comments={sectionCommentAnchors}
                    activeCommentId={activeCommentId}
                    onCreateComment={createPublicCommentFromEditor}
                    onSelectComment={(commentId) => {
                      setPanel("comments");
                      setActiveCommentId(commentId);
                    }}
                  />
                </section>
              );
            })}
          </div>
        </article>
      </main>

      {panel ? (
        <PublicSidePanel
          panel={panel}
          comments={rootComments}
          repliesByParent={repliesByParent}
          activity={activity}
          commentName={commentName}
          activeCommentId={activeCommentId}
          replyingTo={replyingTo}
          replyNamePromptCommentId={replyNamePromptCommentId}
          replyBody={replyBody}
          submittingReplyId={submittingReplyId}
          editorTextScale={editorView.textScale}
          editorWidth={editorView.width}
          onClose={() => setPanel(null)}
          onCommentNameChange={setCommentName}
          onActiveCommentChange={setActiveCommentId}
          onReplyingToChange={(commentId) => {
            setReplyingTo(commentId);
            if (commentId && !commentName.trim()) {
              setReplyNamePromptCommentId(commentId);
            }
          }}
          onReplyBodyChange={setReplyBody}
          onSubmitReply={(commentId) => void submitReply(commentId)}
          onTextScaleChange={(textScale) => setEditorView({ textScale })}
          onWidthChange={(width) => setEditorView({ width })}
        />
      ) : null}

      {!panel ? (
        <div
          data-file-export-hidden
          className={cn(
            "fixed inset-x-0 bottom-6 z-40 hidden items-center justify-center px-6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex",
            mobileBarVisible ? "translate-y-0" : "translate-y-[calc(100%+2rem)]"
          )}
        >
          <div className="flex items-center gap-3 rounded-full border border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 py-2 shadow-[0_14px_36px_rgba(28,28,26,0.14)] dark:shadow-[0_14px_36px_rgba(0,0,0,0.3)]">
            <RailButton
              label="Activity"
              active={panel === "activity"}
              size="desktop"
              onClick={() => setPanel((current) => current === "activity" ? null : "activity")}
            >
              <History className="h-5 w-5" />
            </RailButton>
            <RailButton
              label="Comments"
              active={panel === "comments"}
              badge={rootComments.length}
              size="desktop"
              onClick={() => setPanel((current) => current === "comments" ? null : "comments")}
            >
              <MessageSquare className="h-5 w-5" />
            </RailButton>
            <RailButton label="Export PDF" active={false} size="desktop" onClick={exportPdf}>
              {copiedAction === "pdf" ? <AnimatedCheckmark /> : <FileText className="h-5 w-5" />}
            </RailButton>
            <RailButton label="Download" active={false} size="desktop" onClick={downloadMarkdown}>
              {copiedAction === "download" ? <AnimatedCheckmark /> : <Download className="h-5 w-5" />}
            </RailButton>
            <RailButton label="Copy" active={false} size="desktop" onClick={() => void copyMarkdown()}>
              {copiedAction === "copy" ? <AnimatedCheckmark /> : <Copy className="h-5 w-5" />}
            </RailButton>
            <RailButton
              label="View"
              active={panel === "view"}
              size="desktop"
              onClick={() => setPanel((current) => current === "view" ? null : "view")}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </RailButton>
            <RailButton
              label="Name"
              active={nameDialogOpen}
              size="desktop"
              onClick={openNameDialog}
            >
              <UserCircle className="h-5 w-5" />
            </RailButton>
            <PublicThemeButton size="desktop" />
          </div>
        </div>
      ) : null}

      {/* Mobile-only floating toolbar. Reveals on scroll up, hides on scroll
          down, and steps aside entirely when a side panel is open. */}
      <div
        data-file-export-hidden
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 border-t border-[var(--creed-border)] bg-[color:var(--creed-surface)]/95 px-3 py-2 backdrop-blur-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden",
          panel && "hidden",
          mobileBarVisible ? "translate-y-0" : "translate-y-full"
        )}
      >
        <RailButton
          label="Activity"
          active={panel === "activity"}
          onClick={() => setPanel((current) => current === "activity" ? null : "activity")}
        >
          <History className="h-4 w-4" />
        </RailButton>
        <RailButton
          label="Comments"
          active={panel === "comments"}
          badge={rootComments.length}
          onClick={() => setPanel((current) => current === "comments" ? null : "comments")}
        >
          <MessageSquare className="h-4 w-4" />
        </RailButton>
        <RailButton label="Export PDF" active={false} onClick={exportPdf}>
          {copiedAction === "pdf" ? <AnimatedCheckmark /> : <FileText className="h-4 w-4" />}
        </RailButton>
        <RailButton label="Download" active={false} onClick={downloadMarkdown}>
          {copiedAction === "download" ? <AnimatedCheckmark /> : <Download className="h-4 w-4" />}
        </RailButton>
        <RailButton label="Copy" active={false} onClick={() => void copyMarkdown()}>
          {copiedAction === "copy" ? <AnimatedCheckmark /> : <Copy className="h-4 w-4" />}
        </RailButton>
        <RailButton
          label="View"
          active={panel === "view"}
          onClick={() => setPanel((current) => current === "view" ? null : "view")}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </RailButton>
        <RailButton label="Name" active={nameDialogOpen} onClick={openNameDialog}>
          <UserCircle className="h-4 w-4" />
        </RailButton>
        <PublicThemeButton />
      </div>

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="rounded-[var(--radius-xl)] border-[var(--creed-border)] bg-[var(--creed-surface)]">
          <DialogHeader>
            <DialogTitle>Your comment name</DialogTitle>
            <DialogDescription>
              This name will be used for future public comments and will update your previous comments from this browser.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="Your name"
            className="h-10 rounded-md border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[13px]"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void savePublicName();
              }
            }}
          />
          <DialogFooter className="flex-row items-center justify-between border-t-[var(--creed-border)] bg-[var(--creed-surface)] sm:justify-between">
            <Button variant="ghost" className="rounded-md" onClick={() => setNameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-md bg-[var(--creed-text-primary)] px-4 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
              disabled={savingName || !nameDraft.trim()}
              onClick={() => void savePublicName()}
            >
              {savingName ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RailButton({
  label,
  active,
  badge,
  size = "mobile",
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  badge?: number;
  size?: "mobile" | "desktop";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--creed-text-secondary)] transition-colors hover:bg-[var(--creed-surface-raised)] hover:text-[var(--creed-text-primary)]",
        size === "desktop" && "h-9 w-9 rounded-[11px]",
        active && "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
      )}
    >
      {children}
      {badge ? (
        <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-[#F59E0B] px-1 text-[9px] font-semibold leading-4 text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function PublicThemeButton({ size = "mobile" }: { size?: "mobile" | "desktop" }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8 rounded-[10px] text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]",
        size === "desktop" && "h-9 w-9 rounded-[11px]"
      )}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }}
    >
      <Contrast className={cn("h-4 w-4", size === "desktop" && "h-5 w-5")} />
    </Button>
  );
}

function PublicSidePanel({
  panel,
  comments,
  repliesByParent,
  activity,
  commentName,
  activeCommentId,
  replyingTo,
  replyNamePromptCommentId,
  replyBody,
  submittingReplyId,
  editorTextScale,
  editorWidth,
  onClose,
  onCommentNameChange,
  onActiveCommentChange,
  onReplyingToChange,
  onReplyBodyChange,
  onSubmitReply,
  onTextScaleChange,
  onWidthChange,
}: {
  panel: Exclude<PublicPanel, null>;
  comments: DocumentComment[];
  repliesByParent: Map<string, DocumentComment[]>;
  activity: DocumentActivityEvent[];
  commentName: string;
  activeCommentId: string | null;
  replyingTo: string | null;
  replyNamePromptCommentId: string | null;
  replyBody: string;
  submittingReplyId: string | null;
  editorTextScale: EditorTextScale;
  editorWidth: EditorWidth;
  onClose: () => void;
  onCommentNameChange: (value: string) => void;
  onActiveCommentChange: (value: string | null) => void;
  onReplyingToChange: (value: string | null) => void;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: (commentId: string) => void;
  onTextScaleChange: (value: EditorTextScale) => void;
  onWidthChange: (value: EditorWidth) => void;
}) {
  const title = panel === "comments" ? "Comments" : panel === "activity" ? "Activity" : "View";

  return (
    <aside
      data-file-export-hidden
      className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw-48px,380px)] flex-col border-l border-[var(--creed-border)] bg-[var(--creed-surface)] shadow-xl lg:static lg:z-auto lg:w-auto lg:shadow-none"
    >
      <header className="flex h-14 items-center justify-between border-b border-[var(--creed-border)] px-4">
        <div className="text-[13px] font-medium text-[var(--creed-text-primary)]">{title}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          className="rounded-md text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {panel === "comments" ? (
        <CommentsPanel
          comments={comments}
          repliesByParent={repliesByParent}
          commentName={commentName}
          activeCommentId={activeCommentId}
          replyingTo={replyingTo}
          replyNamePromptCommentId={replyNamePromptCommentId}
          replyBody={replyBody}
          submittingReplyId={submittingReplyId}
          onCommentNameChange={onCommentNameChange}
          onActiveCommentChange={onActiveCommentChange}
          onReplyingToChange={onReplyingToChange}
          onReplyBodyChange={onReplyBodyChange}
          onSubmitReply={onSubmitReply}
        />
      ) : panel === "activity" ? (
        <ActivityPanel activity={activity} />
      ) : (
        <ViewPanel
          textScale={editorTextScale}
          width={editorWidth}
          onTextScaleChange={onTextScaleChange}
          onWidthChange={onWidthChange}
        />
      )}
    </aside>
  );
}

function CommentsPanel({
  comments,
  repliesByParent,
  commentName,
  activeCommentId,
  replyingTo,
  replyNamePromptCommentId,
  replyBody,
  submittingReplyId,
  onCommentNameChange,
  onActiveCommentChange,
  onReplyingToChange,
  onReplyBodyChange,
  onSubmitReply,
}: {
  comments: DocumentComment[];
  repliesByParent: Map<string, DocumentComment[]>;
  commentName: string;
  activeCommentId: string | null;
  replyingTo: string | null;
  replyNamePromptCommentId: string | null;
  replyBody: string;
  submittingReplyId: string | null;
  onCommentNameChange: (value: string) => void;
  onActiveCommentChange: (value: string | null) => void;
  onReplyingToChange: (value: string | null) => void;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: (commentId: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 creed-scrollbar">
      {comments.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--creed-border)] px-3 py-8 text-center text-[13px] text-[var(--creed-text-secondary)]">
          Highlight text in the document and use the comment button to start a thread.
        </div>
      ) : (
        <div className="space-y-5">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={repliesByParent.get(comment.id) ?? []}
              active={activeCommentId === comment.id}
              commentName={commentName}
              replyingTo={replyingTo}
              showNamePrompt={replyNamePromptCommentId === comment.id}
              replyBody={replyBody}
              submittingReply={submittingReplyId === comment.id}
              onCommentNameChange={onCommentNameChange}
              onActiveCommentChange={onActiveCommentChange}
              onReplyingToChange={onReplyingToChange}
              onReplyBodyChange={onReplyBodyChange}
              onSubmitReply={() => onSubmitReply(comment.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentThread({
  comment,
  replies,
  active,
  commentName,
  replyingTo,
  showNamePrompt,
  replyBody,
  submittingReply,
  onCommentNameChange,
  onActiveCommentChange,
  onReplyingToChange,
  onReplyBodyChange,
  onSubmitReply,
}: {
  comment: DocumentComment;
  replies: DocumentComment[];
  active: boolean;
  commentName: string;
  replyingTo: string | null;
  showNamePrompt: boolean;
  replyBody: string;
  submittingReply: boolean;
  onCommentNameChange: (value: string) => void;
  onActiveCommentChange: (value: string | null) => void;
  onReplyingToChange: (value: string | null) => void;
  onReplyBodyChange: (value: string) => void;
  onSubmitReply: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-transparent p-3 transition-colors",
        active
          ? "border-[var(--creed-border)] bg-[var(--creed-surface-raised)]"
          : "border-b-[var(--creed-border)] pb-5 last:border-b-transparent"
      )}
      onClick={() => onActiveCommentChange(comment.id)}
    >
      <CommentItem comment={comment} />
      <button
        type="button"
        className="mt-2 text-[12px] font-medium text-[var(--creed-text-secondary)] transition-colors hover:text-[var(--creed-text-primary)]"
        onClick={() => onReplyingToChange(replyingTo === comment.id ? null : comment.id)}
      >
        Reply
      </button>

      {replies.length > 0 ? (
        <div className="mt-4 space-y-4 border-l border-[var(--creed-border)] pl-4">
          {replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} />
          ))}
        </div>
      ) : null}

      {replyingTo === comment.id ? (
        <div className="mt-4 space-y-2">
          {showNamePrompt ? (
            <Input
              value={commentName}
              onChange={(event) => onCommentNameChange(event.target.value)}
              placeholder="Your name"
              className="h-9 rounded-md border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 text-[13px]"
            />
          ) : null}
          <Textarea
            value={replyBody}
            onChange={(event) => onReplyBodyChange(event.target.value)}
            placeholder="Add a reply"
            className="min-h-20 rounded-md border-[var(--creed-border)] bg-[var(--creed-surface)] px-3 py-2 text-[13px] leading-6"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-8 rounded-md text-[var(--creed-text-secondary)]"
              onClick={() => {
                onReplyBodyChange("");
                onReplyingToChange(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-8 rounded-md bg-[var(--creed-text-primary)] px-3 text-[var(--creed-button-primary-fg)] hover:bg-[var(--creed-button-primary-hover)]"
              disabled={submittingReply || !replyBody.trim() || !commentName.trim()}
              onClick={onSubmitReply}
            >
              {submittingReply ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              Reply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CommentItem({ comment }: { comment: DocumentComment }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 truncate text-[13px] font-medium text-[var(--creed-text-primary)]">
          {comment.authorLabel}
        </div>
        <div className="shrink-0 text-[11px] text-[var(--creed-text-tertiary)]">
          {formatRelativeTime(comment.createdAt)}
        </div>
      </div>
      {comment.referenceQuote.trim() ? (
        <div className="mt-2 border-l-2 border-[var(--creed-border)] pl-3 text-[12px] leading-5 text-[var(--creed-text-secondary)]">
          {comment.referenceQuote}
        </div>
      ) : null}
      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[var(--creed-text-secondary)]">
        {comment.body}
      </p>
    </div>
  );
}

function ActivityPanel({ activity }: { activity: DocumentActivityEvent[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 creed-scrollbar">
      {activity.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--creed-border)] px-3 py-8 text-center text-[13px] text-[var(--creed-text-secondary)]">
          No activity yet.
        </div>
      ) : (
        <div className="space-y-4">
          {activity.map((event) => (
            <div key={event.id} className="border-b border-[var(--creed-border)] pb-4 last:border-b-0">
              <div className="text-[13px] font-medium text-[var(--creed-text-primary)]">
                {event.summary}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-[var(--creed-text-secondary)]">
                {event.actorLabel} - {formatRelativeTime(event.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewPanel({
  textScale,
  width,
  onTextScaleChange,
  onWidthChange,
}: {
  textScale: EditorTextScale;
  width: EditorWidth;
  onTextScaleChange: (value: EditorTextScale) => void;
  onWidthChange: (value: EditorWidth) => void;
}) {
  return (
    <div className="space-y-5 px-4 py-4">
      <ViewSegment
        label="Text"
        value={textScale}
        options={[
          { value: "small", label: "Small" },
          { value: "large", label: "Large" },
        ]}
        onChange={onTextScaleChange}
      />
      <ViewSegment
        label="Width"
        value={width}
        options={[
          { value: "narrow", label: "Narrow" },
          { value: "wide", label: "Wide" },
        ]}
        onChange={onWidthChange}
      />
    </div>
  );
}

function ViewSegment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-[var(--creed-text-secondary)]">
        {label}
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--creed-border)]">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "h-9 px-3 text-[13px] transition-colors",
              value === option.value
                ? "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]"
                : "text-[var(--creed-text-secondary)] hover:text-[var(--creed-text-primary)]"
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
