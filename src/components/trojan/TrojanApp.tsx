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
  return (
    <div className="mx-auto max-w-sm px-5 pt-16">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold text-3xl font-black text-cardinal">T</div>
      <h1 className="text-3xl font-black leading-tight text-white">Answer the question you once had.</h1>
      <p className="mt-2 text-white/70">Sign in to the Trojan app. Students who are stuck get your briefing card; your answer helps every student after them.</p>
      <form onSubmit={go} className="mt-8 space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="w-full rounded-xl bg-white/10 px-4 py-3.5 text-lg text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-gold" />
        <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Helper passcode" type="password" className="w-full rounded-xl bg-white/10 px-4 py-3.5 text-lg text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-gold" />
        <button disabled={busy} className="w-full rounded-xl bg-gold py-3.5 text-lg font-black text-cardinal disabled:opacity-60">{busy ? "Signing in…" : "I'm a Trojan"}</button>
        {err && <p className="text-sm text-gold">{err}</p>}
      </form>
      <p className="mt-6 text-xs text-white/40">Demo sign-in uses a shared passcode. The roadmap uses USC SSO.</p>
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
      <span className="text-xs font-bold uppercase tracking-wider text-black/45">{label}</span>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} className="mt-1 w-full rounded-xl bg-black/5 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-cardinal/30" />
    </label>
  );
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {field("name", "Name", "Daniel")}
        {field("year", "Class year", "2027")}
      </div>
      {field("major", "Major", "Political Science")}
      {field("tags", "Ask me about (comma separated)", "transfer, d-clearance, housing, poir")}
      {field("bio", "One line about you", "Transferred from SMC in 2025")}
      {field("phone", "Phone for calls (private, never shown)", "+1 213 555 0100", "tel")}
      {field("avatar_url", "Photo URL (optional)", "https://…")}
      <button disabled={saving} className="w-full rounded-xl bg-cardinal py-3 font-black text-white disabled:opacity-60">{saved ? "Saved ✓" : saving ? "Saving…" : "Save profile"}</button>
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
    <div className="min-h-screen bg-paper pb-16">
      <div className="bg-cardinal px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center gap-3">
            <Avatar name={me.name} url={me.avatar_url} size={44} online={onShift} />
            <div className="min-w-0">
              <div className="truncate text-lg font-black">{me.name}</div>
              <div className="truncate text-xs text-white/70">{[me.major, me.year].filter(Boolean).join(" · ") || "Add your major"}</div>
            </div>
            <button onClick={() => setEditing((v) => !v)} className="ml-auto rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{editing ? "Done" : "Profile"}</button>
          </div>
          <button
            onClick={toggleShift}
            className={`mt-5 flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left transition ${onShift ? "bg-gold text-cardinal" : "bg-white/10 text-white"}`}
          >
            <span>
              <span className="block text-lg font-black">{onShift ? "You're on shift" : "Off shift"}</span>
              <span className="block text-xs opacity-75">
                {onShift ? `Students see you online until ${new Date(me.on_shift_until!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Tap to go online for 3 hours"}
              </span>
            </span>
            <span className={`relative h-8 w-14 rounded-full ${onShift ? "bg-cardinal" : "bg-white/25"}`}>
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${onShift ? "left-7" : "left-1"}`} />
            </span>
          </button>
          {me.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-xs text-white/60">Ask me about:</span>
              {me.tags.map((t) => (
                <span key={t} className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {flash && (
        <div className="fixed inset-x-3 top-3 z-50 mx-auto max-w-xl rounded-2xl bg-ink p-4 text-white shadow-2xl">
          <div className="text-xs font-bold uppercase tracking-wider text-gold">New question</div>
          <div className="font-bold">{flash}</div>
        </div>
      )}

      <div className="mx-auto max-w-xl px-4">
        {editing && (
          <div className="-mt-3 rounded-2xl bg-white p-4 shadow-lg">
            <Profile me={me} onSaved={(h) => { setMe(h); setEditing(false); }} />
          </div>
        )}

        <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-black uppercase tracking-[0.15em] text-black/50">
          <span className="live-dot" /> Inbox · {open.length} waiting
        </h2>
        {open.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-black/45">No one is waiting. You&apos;ll get a buzz on Discord when someone needs a Trojan.</p>}
        <div className="space-y-3">
          {open.map((i) => (
            <Link key={i.id} href={`/trojan/h/${i.id}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 active:scale-[0.99]">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                <span className="rounded-full bg-ink px-2 py-0.5 text-gold">{i.questions?.audience ?? "student"}</span>
                {i.questions?.image_url && <span className="text-black/45">📷 screenshot</span>}
                <span className="ml-auto text-black/40">{ago(i.created_at)}</span>
              </div>
              <div className="text-lg font-black leading-snug">{i.briefing?.title ?? i.questions?.text}</div>
              {i.briefing ? (
                <p className="mt-1 text-sm text-black/60"><span className="font-bold text-cardinal">Still open: </span>{i.briefing.still_open}</p>
              ) : (
                <p className="mt-1 text-sm text-black/40">Claude is writing the briefing…</p>
              )}
              {i.briefing?.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {i.briefing.tags.map((t) => (
                    <span key={t} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${me.tags.includes(t) ? "bg-gold text-ink" : "bg-black/5 text-black/55"}`}>{t}</span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>

        {mine.length > 0 && (
          <>
            <h2 className="mb-2 mt-8 text-sm font-black uppercase tracking-[0.15em] text-black/50">Yours</h2>
            <div className="space-y-2">
              {mine.map((i) => (
                <Link key={i.id} href={`/trojan/h/${i.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-black/5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${i.status === "claimed" ? "bg-green-500" : i.status === "closed" ? "bg-gold" : "bg-black/20"}`} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{i.briefing?.title ?? i.questions?.text}</span>
                  <span className="text-xs text-black/45">{i.status === "claimed" ? "chatting" : i.status === "closed" ? "needs approval" : "verified ✓"}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="mt-10 flex items-center justify-between text-xs text-black/40">
          <span>Tip: add this app to your home screen.</span>
          <button onClick={logout} className="underline">Sign out</button>
        </div>
      </div>
    </div>
  );
}
