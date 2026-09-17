import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "wedding-draw.session_token";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "需要管理员登录" } },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/draw/:path*", "/api/admin/:path*", "/api/draw/:path*"],
};
