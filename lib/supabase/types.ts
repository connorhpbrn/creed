import type { User } from "@supabase/supabase-js";

// Lightweight structural type used by server-side helpers that work with both
// the Supabase RLS client and the admin client. Wide enough to cover every
// operation Creed performs without forcing every caller to import the full
// generated DB types.

export type SupabaseLikeQueryResult = {
  data: unknown;
  error: { message: string } | null;
};

export type SupabaseLikeQuery = PromiseLike<SupabaseLikeQueryResult> & {
  eq: (column: string, value: unknown) => SupabaseLikeQuery;
  in: (column: string, values: unknown[]) => SupabaseLikeQuery;
  gte: (column: string, value: unknown) => SupabaseLikeQuery;
  lte: (column: string, value: unknown) => SupabaseLikeQuery;
  order: (
    column: string,
    options?: Record<string, unknown>
  ) => SupabaseLikeQuery;
  limit: (count: number) => SupabaseLikeQuery;
  select: (
    columns?: string,
    options?: Record<string, unknown>
  ) => SupabaseLikeQuery;
  maybeSingle: () => Promise<SupabaseLikeQueryResult>;
  single: () => Promise<SupabaseLikeQueryResult>;
};

export type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns?: string, options?: Record<string, unknown>) => SupabaseLikeQuery;
    insert: (values: unknown, options?: Record<string, unknown>) => SupabaseLikeQuery;
    update: (values: unknown) => SupabaseLikeQuery;
    upsert: (values: unknown, options?: Record<string, unknown>) => SupabaseLikeQuery;
    delete: () => SupabaseLikeQuery;
  };
  auth?: {
    admin?: {
      getUserById?: (
        id: string
      ) => Promise<{ data: { user: User | null }; error: { message: string } | null }>;
    };
  };
};
