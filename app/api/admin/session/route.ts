import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_COOKIE = "gar-admin-session";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET() {
  const sessionToken = process.env.ADMIN_SESSION_TOKEN;
  if (!sessionToken) {
    return NextResponse.json({ unlocked: false });
  }

  const jar = await cookies();
  const cookieValue = jar.get(ADMIN_COOKIE)?.value ?? "";
  return NextResponse.json({ unlocked: safeEqual(cookieValue, sessionToken) });
}
