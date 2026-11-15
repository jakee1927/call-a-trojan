"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserDb } from "@/lib/supabase-browser";
import { Avatar } from "../Avatar";

type Helper = {
  id: string;
  name: string;
  year: string | null;
  major: string | null;
  tags: string[];
  bio: string | null;
  phone: string | null;
  avatar_url: string | null;
  on_shift_until: string | null;
};
type InboxItem = {
  id: string;
  status: string;
  helper_id: string | null;
  created_at: string;
  briefing: { title: string; asked: string; still_open: string; tags: string[] } | null;
  questions: { text: string; audience: string; route: string | null; image_url: string | null } | null;
};

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/trojan/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, passcode: pass }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "Couldn't sign in");
    onDone();
  }
  const dark = "field !py-3 !text-lg";
  return (
    <div className="mx-auto max-w-sm px-5 pt-[max(4rem,env(safe-area-inset-top))]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/usc/sc.svg" alt="USC" width={54} height={80} className="bob h-20 w-auto" />
      <h1 className="display mt-5 text-[2.6rem] text-gold">Answer the question you once had.</h1>
      <p className="mt-3 text-white/85">Students who are stuck get sent to you with a short briefing. Your answer helps every student after them.</p>
      <form onSubmit={go} className="mt-8 space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" autoComplete="name" className={dark} />
        <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Helper passcode" aria-label="Helper passcode" type="password" className={dark} />
        <button disabled={busy} data-fx="rain" className="btn btn-gold btn-lg w-full">{busy ? "Signing in…" : "I'm a Trojan ✌️"}</button>
        {err && <p className="text-sm font-semibold text-gold">{err}</p>}
      </form>
      <p className="mt-6 text-sm text-white/75">Demo sign-in uses a shared passcode. The roadmap uses USC SSO.</p>
    </div>
  );
}

function Profile({ me, onSaved }: { me: Helper; onSaved: (h: Helper) => void }) {
  const [f, setF] = useState({
    name: me.name,
    year: me.year ?? "",
    major: me.major ?? "",
    tags: me.tags.join(", "),
    bio: me.bio ?? "",
    phone: me.phone ?? "",
    avatar_url: me.avatar_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const r = await fetch("/api/trojan/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) {
      onSaved(d.helper);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }
  const field = (k: keyof typeof f, label: string, ph: string, type = "text") => (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} className="field mt-1" />
    </label>
  );
  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {field("name", "Name", "Daniel")}
        {field("year", "Class year", "2027")}
      </div>
      {field("major", "Major", "Political Science")}
      {field("tags", "Ask me about (comma separated)", "transfer, d-clearance, housing, poir")}
      {field("bio", "One line about you", "Transferred from SMC in 2025")}
      {field("phone", "Phone for calls (private, never shown)", "+1 213 555 0100", "tel")}
      {field("avatar_url", "Photo URL (optional)", "https://…")}
      <button disabled={saving} data-fx="boom" className="btn btn-primary w-full">{saved ? "Saved ✌️" : saving ? "Saving…" : "Save profile"}</button>
    </form>
  );
}

export function TrojanApp() {
  const [me, setMe] = useState<Helper | null | undefined>(undefined);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const known = useRef<Set<string>>(new Set());

  const loadMe = useCallback(async () => {
    const d = await fetch("/api/trojan/me", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ helper: null }));
    setMe(d.helper ?? null);
    if (d.helper && (!d.helper.tags?.length || !d.helper.major)) setEditing(true);
  }, []);

  const loadInbox = useCallback(async () => {
    const r = await fetch("/api/trojan/inbox", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    const items = (d.handoffs ?? []) as InboxItem[];
    const fresh = items.filter((i) => i.status === "open" && !known.current.has(i.id));
    if (known.current.size > 0 && fresh.length) {
      setFlash(fresh[0].briefing?.title ?? fresh[0].questions?.text ?? "New question");
      try {
        navigator.vibrate?.([120, 60, 120]);
      } catch {}
      setTimeout(() => setFlash(null), 4000);
    }
    items.forEach((i) => known.current.add(i.id));
    setInbox(items);
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!me) return;
    loadInbox();
    const ch = browserDb()
      .channel("inbox")
      .on("broadcast", { event: "handoff" }, () => loadInbox())
      .subscribe();
    const t = setInterval(loadInbox, 30000);
    return () => {
      clearInterval(t);
      browserDb().removeChannel(ch);
    };
  }, [me, loadInbox]);

  async function toggleShift() {
    if (!me) return;
    const on = me.on_shift_until && new Date(me.on_shift_until) > new Date();
    const r = await fetch("/api/trojan/shift", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: on ? 0 : 3 }) });
    const d = await r.json();
    if (r.ok) setMe({ ...me, on_shift_until: d.on_shift_until });
  }

  async function logout() {
    await fetch("/api/trojan/logout", { method: "POST" });
    setMe(null);
  }

  if (me === undefined) return <div className="min-h-screen bg-cardinal" />;
  if (me === null)
    return (
      <div className="min-h-screen bg-cardinal">
        <SignIn onDone={loadMe} />
      </div>
    );

  const onShift = !!me.on_shift_until && new Date(me.on_shift_until) > new Date();
  const open = inbox.filter((i) => i.status === "open");
  const mine = inbox.filter((i) => i.helper_id === me.id && i.status !== "open");

  return (
    <div className="min-h-screen pb-16">
      <div className="bg-cardinal px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Avatar name={me.name} url={me.avatar_url} size={40} online={onShift} />
          <div className="min-w-0 flex-1">
            <div className="display truncate text-2xl text-gold">{me.name}</div>
            <div className="truncate text-sm text-white/80">{[me.major, me.year].filter(Boolean).join(" · ") || "Add your major"}</div>
          </div>
          <button onClick={() => setEditing((v) => !v)} className="btn btn-gold !py-1.5">
            {editing ? "Done" : "Profile"}
          </button>
        </div>
      </div>

      {flash && (
        <div role="status" className="sticker sticker-ink slam fixed inset-x-3 top-3 z-50 mx-auto max-w-xl px-4 py-3">
          <div className="display text-lg text-gold">🚨 New question</div>
          <div className="font-semibold">{flash}</div>
        </div>
      )}

      <div className="mx-auto max-w-xl px-5">
        <button
          onClick={toggleShift}
          role="switch"
          aria-checked={onShift}
          data-fx="boom"
          className={`sticker grab mt-6 flex w-full items-center justify-between gap-4 px-5 py-4 text-left ${onShift ? "sticker-cardinal tilt-r" : "tilt-l"}`}
        >
          <span>
            <span className="display block text-2xl">{onShift ? "You're on shift ✌️" : "Off shift 😴"}</span>
            <span className="block text-sm font-medium opacity-90">
              {onShift ? `Students see you online until ${new Date(me.on_shift_until!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Tap to go online for 3 hours"}
            </span>
          </span>
          <span className={`relative h-8 w-14 shrink-0 rounded-full border-[2.5px] border-ink transition-colors ${onShift ? "bg-gold" : "bg-wash"}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full border-[2.5px] border-ink bg-white transition-all duration-300 ${onShift ? "left-[1.6rem]" : "left-0.5"}`} />
          </span>
        </button>
        {me.tags.length > 0 && <p className="mt-4 text-sm font-semibold">Students are sent to you for {me.tags.join(", ")}.</p>}

        {editing && (
          <div className="sticker pop mt-6 p-5">
            <Profile me={me} onSaved={(h) => { setMe(h); setEditing(false); }} />
          </div>
        )}

        <h2 className="display mt-10 text-3xl">
          Inbox <span className="text-cardinal">· {open.length} waiting</span>
        </h2>
        {open.length === 0 && <p className="mt-2 font-medium">No one is waiting. You&apos;ll get a buzz on Discord when someone needs a Trojan.</p>}
        <ul className="mt-4 space-y-5 empty:hidden">
          {open.map((i, n) => (
            <li key={i.id} className="drop" style={{ "--i": n } as React.CSSProperties}>
              <Link href={`/trojan/h/${i.id}`} className={`sticker grab group block p-4 ${n % 2 ? "tilt-r" : "tilt-l"}`}>
                <div className="flex gap-2 text-sm text-muted">
                  <span className="capitalize">{i.questions?.audience ?? "student"}</span>
                  {i.questions?.image_url && <span>· with a screenshot</span>}
                  <span className="ml-auto">{ago(i.created_at)}</span>
                </div>
                <div className="mt-1 text-[17px] font-bold leading-snug group-hover:text-cardinal">{i.briefing?.title ?? i.questions?.text}</div>
                {i.briefing ? (
                  <p className="mt-1 text-[15px] text-muted"><span className="font-semibold text-ink">Still open: </span>{i.briefing.still_open}</p>
                ) : (
                  <p className="mt-1 text-[15px] text-muted">The AI is writing the briefing…</p>
                )}
                {i.briefing?.tags?.length ? (
                  <p className="mt-1.5 text-sm text-muted">
                    {i.briefing.tags.map((t, n) => (
                      <span key={t}>
                        {n > 0 && " · "}
                        <span className={me.tags.includes(t) ? "bg-gold-tint font-semibold text-ink" : ""}>{t}</span>
                      </span>
                    ))}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>

        {mine.length > 0 && (
          <>
            <h2 className="display mt-10 text-3xl">Yours</h2>
            <ul className="sticker mt-4 divide-y-2 divide-line px-4">
              {mine.map((i) => (
                <li key={i.id}>
                  <Link href={`/trojan/h/${i.id}`} className="group flex items-baseline gap-4 py-3">
                    <span className="min-w-0 flex-1 truncate group-hover:text-cardinal">{i.briefing?.title ?? i.questions?.text}</span>
                    <span className={`shrink-0 text-sm ${i.status === "closed" ? "font-semibold text-cardinal" : "text-muted"}`}>
                      {i.status === "claimed" ? "Chatting" : i.status === "closed" ? "Needs approval" : "Verified"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-12 flex items-center justify-between text-sm font-semibold">
          <span>Tip: add this app to your home screen.</span>
          <button onClick={logout} className="underline underline-offset-2 hover:text-ink">Sign out</button>
        </div>
      </div>
    </div>
  );
}
