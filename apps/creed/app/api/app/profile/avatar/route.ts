import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateCompanyGeneral } from "@/lib/company-admin";
import { getCreedRole } from "@/lib/creed-membership";
import { checkRateLimit } from "@/lib/rate-limit";

const AVATAR_BUCKET = "creed-avatars";
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

type StorageClient = {
  storage: {
    createBucket: (
      bucket: string,
      options: {
        public: boolean;
        fileSizeLimit: number;
        allowedMimeTypes: string[];
      },
    ) => Promise<{ error: { message: string } | null }>;
    updateBucket: (
      bucket: string,
      options: {
        public: boolean;
        fileSizeLimit: number;
        allowedMimeTypes: string[];
      },
    ) => Promise<{ error: { message: string } | null }>;
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        options: {
          cacheControl: string;
          contentType: string;
          upsert: boolean;
        },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
    };
  };
};

async function ensureAvatarBucket(storage: StorageClient["storage"]) {
  const options = {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: [...ALLOWED_TYPES.keys()],
  };
  const { error } = await storage.createBucket(AVATAR_BUCKET, options);
  if (!error) return;
  if (!/already exists/i.test(error.message)) {
    throw new Error("Could not prepare image storage.");
  }
  await storage.updateBucket(AVATAR_BUCKET, options);
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth instanceof NextResponse) return auth;
  const rateLimit = await checkRateLimit({ scope: "avatar-upload", identifier: auth.user.id, limit: 3, windowMs: 60 * 60_000 });
  if (!rateLimit.ok) return NextResponse.json({ error: "Too many profile picture uploads." }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });

  const form = await request.formData().catch(() => null);
  if (!form) return badRequest("Invalid upload.");

  const scope = form.get("scope");
  const file = form.get("file");
  const creedId = form.get("creedId");

  if (scope !== "personal" && scope !== "company") {
    return badRequest("Invalid profile type.");
  }
  if (!(file instanceof File)) {
    return badRequest("Choose an image.");
  }
  if (scope === "company") {
    if (typeof creedId !== "string" || !creedId) {
      return badRequest("creedId is required.");
    }
    const role = await getCreedRole(
      getSupabaseAdminClient(),
      auth.user.id,
      creedId,
    );
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Only an owner or admin can update company settings." },
        { status: 403 },
      );
    }
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return badRequest("Use a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return badRequest("Use an image smaller than 3 MB.");
  }

  const extension = ALLOWED_TYPES.get(file.type) ?? "png";
  const ownerKey = scope === "company" ? String(creedId) : auth.user.id;
  const path = `${scope}/${ownerKey}/${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getSupabaseAdminClient() as unknown as StorageClient;
  try {
    await ensureAvatarBucket(storage.storage);
  } catch {
    return NextResponse.json(
      { error: "Could not prepare image storage." },
      { status: 500 },
    );
  }
  const { error: uploadError } = await storage.storage
    .from(AVATAR_BUCKET)
    .upload(path, buffer, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: "Could not upload image." },
      { status: 500 },
    );
  }

  const {
    data: { publicUrl },
  } = storage.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  if (scope === "personal") {
    const previousUrl = typeof auth.user.user_metadata?.avatar_url === "string" ? auth.user.user_metadata.avatar_url : null;
    const { error } = await auth.supabase.auth.updateUser({
      data: {
        avatar_url: publicUrl,
        picture: publicUrl,
      },
    });
    if (error) {
      await storage.storage.from(AVATAR_BUCKET).remove([path]);
      return NextResponse.json(
        { error: "Could not save profile picture." },
        { status: 500 },
      );
    }
    if (previousUrl) await removePreviousAvatar(storage, previousUrl, path);
  } else {
    const { data: previousCompany } = await getSupabaseAdminClient().from("creeds").select("avatar_url").eq("id", String(creedId)).maybeSingle();
    const result = await updateCompanyGeneral({
      creedId: String(creedId),
      actor: auth.user,
      avatarUrl: publicUrl,
    });
    if (!result.ok) {
      await storage.storage.from(AVATAR_BUCKET).remove([path]);
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    const previousUrl = (previousCompany as { avatar_url?: string | null } | null)?.avatar_url;
    if (previousUrl) await removePreviousAvatar(storage, previousUrl, path);
  }

  return NextResponse.json({ ok: true, avatarUrl: publicUrl });
}

async function removePreviousAvatar(storage: StorageClient, publicUrl: string, currentPath: string) {
  try {
    const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
    const encodedPath = publicUrl.split(marker)[1];
    if (!encodedPath) return;
    const previousPath = decodeURIComponent(encodedPath);
    if (previousPath !== currentPath) await storage.storage.from(AVATAR_BUCKET).remove([previousPath]);
  } catch {
    // The new avatar is already saved. Orphan cleanup is best-effort.
  }
}
