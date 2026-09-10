import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@insforge/sdk/ssr/middleware";

import { getInsforgeEnv } from "@/lib/insforge/env";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const { baseUrl, anonKey } = getInsforgeEnv();

  await updateSession({
    baseUrl,
    anonKey,
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
