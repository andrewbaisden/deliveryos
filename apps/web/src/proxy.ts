import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request))
    return NextResponse.redirect(new URL("/sign-in", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/ops/:path*", "/driver/:path*"] };
