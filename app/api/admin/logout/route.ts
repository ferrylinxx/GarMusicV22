import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ADMIN_COOKIE = "gar-admin-session";

export async function POST() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
