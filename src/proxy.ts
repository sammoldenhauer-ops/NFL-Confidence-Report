import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, expectedAuthToken } from "./lib/auth";

// Gates the private PrizePicks surface (page + published slate data) behind a shared password.
// The rest of the site (home page, the cron route) is unaffected - see matcher below.
export async function proxy(request: NextRequest) {
  const expected = await expectedAuthToken();
  if (!expected) {
    // APP_PASSWORD not configured - fail closed rather than leaving the page open.
    return new NextResponse("PrizePicks page is not configured (missing APP_PASSWORD).", { status: 503 });
  }

  if (request.cookies.get(AUTH_COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/prizepicks/:path*", "/data/prizepicks/:path*"],
};
