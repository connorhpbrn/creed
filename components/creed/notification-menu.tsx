"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LoaderCircle } from "@/components/ui/phosphor-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DocumentNotification } from "@/lib/document-collaboration";

async function readNotifications() {
  const response = await fetch("/api/app/notifications", { cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as { notifications?: DocumentNotification[] };
  return payload.notifications ?? [];
}

export function NotificationMenu({
  iconOnly = false,
  className,
}: {
  iconOnly?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<DocumentNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const rows = await readNotifications();
      if (!cancelled) {
        setNotifications(rows);
        setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function openNotification(notification: DocumentNotification) {
    setNotifications((rows) =>
      rows.map((row) => row.id === notification.id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row)
    );
    await fetch(`/api/app/notifications/${encodeURIComponent(notification.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    }).catch(() => null);
    router.push(notification.href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-8 w-8 rounded-[10px]",
            !iconOnly && "lg:h-8 lg:w-full lg:justify-start lg:gap-3 lg:px-2",
            className
          )}
          aria-label="Notifications"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          {!iconOnly ? (
            <span className="hidden text-[14px] font-medium lg:inline">Notifications</span>
          ) : null}
          {unreadCount > 0 ? (
            <span
              className={cn(
                "absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-semibold leading-none text-white",
                !iconOnly && "lg:right-2"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 border-[var(--creed-border)] bg-[var(--creed-surface)]">
        {notifications.length > 0 ? (
          notifications.slice(0, 12).map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              onSelect={() => void openNotification(notification)}
              className="items-start gap-2 whitespace-normal py-2.5"
            >
              <span
                className={cn(
                  "mt-1 h-2 w-2 shrink-0 rounded-full",
                  notification.readAt ? "bg-[var(--creed-border)]" : "bg-[#2563EB]"
                )}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[var(--creed-text-primary)]">
                  {notification.title}
                </span>
                <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-[var(--creed-text-secondary)]">
                  {notification.body}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-3 py-8 text-center text-[13px] text-[var(--creed-text-tertiary)]">
            No notifications
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
