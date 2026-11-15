import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "ct_helper";

function secret() {
  return `${process.env.HELPER_PASSCODE ?? ""}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
}
function sign(id: string) {
  return crypto.createHmac("sha256", secret()).update(id).digest("base64url");
}

export function passcodeOk(passcode: string): boolean {
  const want = process.env.HELPER_PASSCODE ?? "";
  if (!want) return false;
  const a = Buffer.from(passcode.trim().toLowerCase());
  const b = Buffer.from(want.trim().toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function setHelperCookie(id: string) {
  (await cookies()).set(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearHelperCookie() {
  (await cookies()).delete(COOKIE);
}

/** Returns the signed-in helper id, or null. */
export async function currentHelperId(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return null;
  const [id, sig] = v.split(".");
  if (!id || !sig) return null;
  const good = sign(id);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  return id;
}
