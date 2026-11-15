import { clearHelperCookie } from "@/lib/helper-auth";
export async function POST() {
  await clearHelperCookie();
  return Response.json({ ok: true });
}
