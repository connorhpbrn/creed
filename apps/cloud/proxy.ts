import type { NextRequest } from "next/server";
import { handleCreedProxy } from "@/proxy";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets|api/(?:status|version|health|github/stars|roadmap)(?:/|$)|.*\\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico|woff2?|ttf|otf|mp4)$).*)"],
};

export function proxy(request: NextRequest) {
  return handleCreedProxy(request, {
    unauthenticatedRoot: "/home",
    additionalScriptSources: [
      "https://js.stripe.com",
      "https://checkout.stripe.com",
    ],
    additionalConnectSources: [
      "https://api.stripe.com",
      "https://checkout.stripe.com",
    ],
    additionalFrameSources: [
      "https://js.stripe.com",
      "https://checkout.stripe.com",
      "https://hooks.stripe.com",
    ],
  });
}
