"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UploadIcon, type UploadIconHandle } from "@/components/ui/upload";
import { cn } from "@/lib/utils";

export type ProfileAvatarKind = "person" | "company";

export function SettingsProfileLayout({
  avatar,
  nameField,
  emailField,
}: {
  avatar: ReactNode;
  nameField: ReactNode;
  emailField: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-4 md:gap-x-5 md:gap-y-5">
      {avatar}
      <div className="contents">
        <div className="min-w-0">{nameField}</div>
        <div className="col-span-2 min-w-0">{emailField}</div>
      </div>
    </div>
  );
}

const SIZE_CLASS = {
  sm: "h-6 w-6 rounded-[8px] after:rounded-[8px]",
  md: "h-9 w-9 rounded-sm after:rounded-sm",
  lg: "h-40 w-40 rounded-[26px] after:rounded-[26px]",
  responsive:
    "h-[4.5rem] w-[4.5rem] rounded-[18px] after:rounded-[18px]",
} as const;

const IMAGE_RADIUS = {
  sm: "rounded-[8px]",
  md: "rounded-sm",
  lg: "rounded-[26px]",
  responsive: "rounded-[18px]",
} as const;

export function ProfileAvatar({
  kind,
  name,
  initials,
  avatarUrl,
  size = "md",
  className,
}: {
  kind: ProfileAvatarKind;
  name: string;
  initials?: string;
  avatarUrl?: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl) && failedUrl !== avatarUrl;
  const fallbackText =
    kind === "company" ? (name.trim().charAt(0) || "C") : initials;

  return (
    <Avatar
      className={cn(
        "shrink-0 overflow-hidden border border-[var(--creed-border)] bg-[var(--creed-surface-raised)]",
        kind === "company" &&
          !showImage &&
          "bg-[var(--creed-surface-raised)] text-[var(--creed-text-primary)]",
        SIZE_CLASS[size],
        className,
      )}
    >
      {showImage && avatarUrl ? (
        <Image
          key={avatarUrl}
          src={avatarUrl}
          alt={name}
          fill
          className={cn("object-cover", IMAGE_RADIUS[size])}
          referrerPolicy="no-referrer"
          unoptimized
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        <AvatarFallback
          className={cn(
            "bg-transparent font-medium text-current",
            size === "lg" || size === "responsive"
              ? "text-[2.15rem] leading-none tracking-[-0.06em] md:text-[2.5rem]"
              : "text-[13px]",
          )}
        >
          {fallbackText}
        </AvatarFallback>
      )}
    </Avatar>
  );
}

export function EditableProfileAvatar({
  kind,
  name,
  initials,
  avatarUrl,
  disabled,
  uploading,
  onFile,
}: {
  kind: ProfileAvatarKind;
  name: string;
  initials?: string;
  avatarUrl?: string;
  disabled?: boolean;
  uploading?: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadIconRef = useRef<UploadIconHandle | null>(null);

  return (
    <div className="relative h-[4.5rem] w-[4.5rem] shrink-0">
      <ProfileAvatar
        kind={kind}
        name={name}
        initials={initials}
        avatarUrl={avatarUrl}
        size="responsive"
        className="h-[4.5rem] w-[4.5rem]"
      />
      <button
        type="button"
        disabled={disabled || uploading}
        aria-label={`Upload ${kind === "company" ? "company" : "profile"} picture`}
        onClick={() => inputRef.current?.click()}
        onMouseEnter={() => uploadIconRef.current?.startAnimation()}
        onMouseLeave={() => uploadIconRef.current?.stopAnimation()}
        onFocus={() => uploadIconRef.current?.startAnimation()}
        onBlur={() => uploadIconRef.current?.stopAnimation()}
        className={cn(
          "group absolute inset-0 flex items-center justify-center rounded-[18px] transition-colors duration-150",
          disabled
            ? "cursor-not-allowed"
            : cn(
                "cursor-pointer hover:bg-black/35 focus-visible:bg-black/35 focus-visible:outline-none",
                uploading && "bg-black/35",
              ),
        )}
      >
        {uploading ? (
          <LoaderCircle className="h-7 w-7 animate-spin text-white" />
        ) : disabled ? null : (
          <UploadIcon
            ref={uploadIconRef}
            size={30}
            className="text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
