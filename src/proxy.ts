import { NextRequest, NextResponse } from "next/server";

import { assertSameOrigin, CrossOriginRequestError } from "@/lib/csrf";

const SESSION_COOKIES = [
  "wedding-draw.session_token",
  "__Secure-wedding-draw.session_token",
] as const;

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
  if (request.nextUrl.pathname === "/api/registration") {
    return NextResponse.next();
  }
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) {
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
  matcher: ["/admin/:path*", "/draw/:path*", "/api/admin/:path*", "/api/draw/:path*", "/api/registration"],
};
