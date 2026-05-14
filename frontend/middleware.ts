// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const role = request.cookies.get('role')?.value;
  const path = request.nextUrl.pathname;

  // Protect all dashboard routes
  if (path.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Role-based routing protection
    if (path.startsWith('/dashboard/teacher') && role !== 'Teacher' && role !== 'Admin') {
      return NextResponse.redirect(new URL(`/dashboard/${role?.toLowerCase()}`, request.url));
    }
    if (path.startsWith('/dashboard/student') && role !== 'Student' && role !== 'Admin') {
      return NextResponse.redirect(new URL(`/dashboard/${role?.toLowerCase()}`, request.url));
    }
    if (path.startsWith('/dashboard/parent') && role !== 'Parent' && role !== 'Admin') {
      return NextResponse.redirect(new URL(`/dashboard/${role?.toLowerCase()}`, request.url));
    }
  }

  // Redirect authenticated users away from auth pages
  if ((path === '/login' || path === '/signup') && token) {
    return NextResponse.redirect(new URL(`/dashboard/${role?.toLowerCase()}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};