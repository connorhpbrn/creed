import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@creed/persistence/supabase/server";
import { authorizeInteractiveRequest } from "@creed/edition/auth";

export type AuthContext = {
  supabase: SupabaseClient;
  user: User;
};

export async function requireApiAuth(): Promise<AuthContext | NextResponse> {
  if (!(await authorizeInteractiveRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { supabase, user };
}
