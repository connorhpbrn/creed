import type { NextRequest } from "next/server";
import { handleCreedProxy } from "@/proxy";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets|api/(?:status|version|health|github/stars|roadmap)(?:/|$)|.*\\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico|woff2?|ttf|otf|mp4)$).*)"],
};

export function proxy(request: NextRequest) {
  return handleCreedProxy(request, {
    unauthenticatedRoot: "/claim",
    ownerCookie: "creed_open_owner",
  });
}
