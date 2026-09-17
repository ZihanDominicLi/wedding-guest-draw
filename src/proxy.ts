import { NextRequest, NextResponse } from "next/server";

import { assertSameOrigin, CrossOriginRequestError } from "@/lib/csrf";

const SESSION_COOKIE = "wedding-draw.session_token";

export function proxy(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof CrossOriginRequestError) {
      return Response.json(
        { error: { code: "CROSS_ORIGIN_REJECTED", message: "请求来源无效" } },
        { status: 403 },
      );
    }
    throw error;
  }
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
