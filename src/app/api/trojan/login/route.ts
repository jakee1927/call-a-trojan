import { db } from "@/lib/supabase-server";
import { passcodeOk, setHelperCookie } from "@/lib/helper-auth";

/** Passcode sign-in. Same name (case-insensitive) signs back into the same profile. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!passcodeOk(String(body.passcode ?? ""))) return Response.json({ error: "Wrong passcode." }, { status: 401 });
  if (name.length < 2) return Response.json({ error: "Add your first name." }, { status: 400 });
  const supa = db();
  const { data: existing } = await supa
    .from("helpers")
    .select("id")
    .ilike("name", name)
    .eq("is_demo", false)
    .eq("is_ai", false)
    .limit(1)
    .maybeSingle();
  let id = existing?.id as string | undefined;
  if (!id) {
    const { data, error } = await supa
      .from("helpers")
      .insert({ name, tags: [], on_shift_until: new Date(Date.now() + 3 * 3600_000).toISOString() })
      .select("id")
      .single();
    if (error || !data) return Response.json({ error: error?.message ?? "could not create profile" }, { status: 500 });
    id = data.id;
  }
  await setHelperCookie(id!);
  return Response.json({ id, created: !existing });
}
