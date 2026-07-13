import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname === "/admin/login";
  const isAdminPath = request.nextUrl.pathname.startsWith("/admin");

  if (!isAdminPath || isLoginPage) {
    return NextResponse.next();
  }

  const session = request.cookies.get("admin_session")?.value;
  if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
