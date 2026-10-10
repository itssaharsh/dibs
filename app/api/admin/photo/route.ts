import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { presenterOk } from "@/lib/admin";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 600 * 1024;
const EXT: Record<string, string> = { jpeg: "jpg", png: "png", webp: "webp" };

/** POST {dataUrl} → stores a product photo (the browser already shrank it) and returns its URL. Seller only. */
export async function POST(req: Request) {
  if (!presenterOk(req)) return NextResponse.json({ error: "presenter key required" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { dataUrl?: string } | null;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body?.dataUrl ?? "");
  if (!m) return NextResponse.json({ error: "a JPEG, PNG or WebP image is required" }, { status: 400 });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "photo too large (600 KB max)" }, { status: 413 });
  const id = `${randomBytes(8).toString("hex")}.${EXT[m[1]]}`;
  if (!getStore().savePhoto(id, bytes)) return NextResponse.json({ error: "couldn't store the photo" }, { status: 500 });
  return NextResponse.json({ url: `/api/photo/${id}` });
}
