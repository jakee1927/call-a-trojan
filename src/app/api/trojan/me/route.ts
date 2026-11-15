import { db } from "@/lib/supabase-server";
import { currentHelperId } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentHelperId();
  if (!me) return Response.json({ helper: null });
  const { data } = await db()
    .from("helpers")
    .select("id,name,year,major,tags,bio,phone,avatar_url,on_shift_until,org_slug")
    .eq("id", me)
    .single();
  return Response.json({ helper: data ?? null });
}

export async function PATCH(req: Request) {
  const me = await currentHelperId();
  if (!me) return Response.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 60);
  if (typeof b.year === "string") patch.year = b.year.trim().slice(0, 20) || null;
  if (typeof b.major === "string") patch.major = b.major.trim().slice(0, 60) || null;
  if (typeof b.bio === "string") patch.bio = b.bio.trim().slice(0, 200) || null;
  if (typeof b.phone === "string") patch.phone = b.phone.replace(/[^\d+]/g, "").slice(0, 16) || null;
  if (typeof b.avatar_url === "string") patch.avatar_url = b.avatar_url.trim().slice(0, 500) || null;
  if (b.org_slug === "usg" || b.org_slug === null) patch.org_slug = b.org_slug;
  if (Array.isArray(b.tags))
    patch.tags = b.tags
      .map((t: unknown) => String(t).trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30))
      .filter(Boolean)
      .slice(0, 12);
  const { data, error } = await db()
    .from("helpers")
    .update(patch)
    .eq("id", me)
    .select("id,name,year,major,tags,bio,phone,avatar_url,on_shift_until,org_slug")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ helper: data });
}
