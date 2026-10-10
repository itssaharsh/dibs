import { getStore } from "@/lib/store";

export const runtime = "nodejs";

const TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** GET /api/photo/<id> → a product photo a seller uploaded. */
export async function GET(_req: Request, ctx: RouteContext<"/api/photo/[id]">) {
  const { id } = await ctx.params;
  const m = /^[a-f0-9]{16}\.(jpg|png|webp)$/.exec(id);
  const bytes = m ? getStore().readPhoto(id) : null;
  if (!m || !bytes) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": TYPE[m[1]], "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
