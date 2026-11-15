"use client";
import { useEffect } from "react";

/**
 * The fun layer. Every tap on a button, link or tab throws a little confetti
 * from the pointer and squishes the thing you pressed. Big moments call
 * boom() (large burst + screen shake) or rain() (things falling from the top).
 * All of it is skipped for people who ask for reduced motion.
 */

const COLORS = ["#990000", "#ffcc00", "#ffffff", "#1d0a0a", "#ffcc00", "#990000"];
const BITS = ["✌️", "✌️", "⚔️", "🐎", "🔥", "⭐"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function calm() {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let layer: HTMLDivElement | null = null;
function getLayer() {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;";
  document.body.appendChild(layer);
  return layer;
}

/** Confetti from a point. `power` scales how far and how big. */
export function burst(x: number, y: number, n = 10, power = 1) {
  if (calm()) return;
  const L = getLayer();
  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    const emoji = Math.random() < 0.3;
    const size = emoji ? 16 + Math.random() * 18 * power : 7 + Math.random() * 9;
    if (emoji) el.textContent = pick(BITS);
    el.style.cssText =
      `position:absolute;left:${x}px;top:${y}px;line-height:1;font-size:${size}px;will-change:transform,opacity;` +
      (emoji ? "" : `width:${size}px;height:${size * (Math.random() < 0.4 ? 0.45 : 1)}px;background:${pick(COLORS)};border:1.5px solid #1d0a0a;border-radius:${Math.random() < 0.45 ? "50%" : "2px"};`);
    const ang = Math.random() * Math.PI * 2;
    const dist = (50 + Math.random() * 130) * power;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 50 * power;
    const rot = (Math.random() - 0.5) * 900;
    const a = el.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.3) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 110 * power}px)) scale(0.5) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 650 + Math.random() * 500, easing: "cubic-bezier(.15,.8,.3,1)" },
    );
    L.appendChild(el);
    a.onfinish = () => el.remove();
  }
}

export function shake() {
  if (calm()) return;
  const root = document.documentElement;
  root.classList.remove("fx-shake");
  void root.offsetWidth; // restart the animation if one is already running
  root.classList.add("fx-shake");
  window.setTimeout(() => root.classList.remove("fx-shake"), 480);
  try {
    navigator.vibrate?.(30);
  } catch {}
}

/** The big one. Defaults to the middle of the screen. */
export function boom(x = window.innerWidth / 2, y = window.innerHeight * 0.42) {
  burst(x, y, 40, 2.1);
  shake();
}

/** Boom from the middle of an element. */
export function boomFrom(el: Element | null | undefined) {
  if (!el) return boom();
  const r = el.getBoundingClientRect();
  boom(r.left + r.width / 2, r.top + r.height / 2);
}

/** Things fall from the sky. */
export function rain(what: string[] = ["✌️"], n = 44) {
  if (calm()) return;
  const L = getLayer();
  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    el.textContent = pick(what);
    const size = 22 + Math.random() * 34;
    el.style.cssText = `position:absolute;left:${Math.random() * 100}vw;top:-60px;font-size:${size}px;line-height:1;will-change:transform;`;
    const drift = (Math.random() - 0.5) * 160;
    const a = el.animate(
      [
        { transform: "translate(0,0) rotate(0deg)" },
        { transform: `translate(${drift}px, ${window.innerHeight + 140}px) rotate(${(Math.random() - 0.5) * 720}deg)` },
      ],
      { duration: 1300 + Math.random() * 1500, delay: Math.random() * 700, easing: "cubic-bezier(.3,.1,.7,1)" },
    );
    L.appendChild(el);
    a.onfinish = () => el.remove();
  }
}

/** A word that pops up from a point and floats away, like a hit marker. */
export function shout(text: string, x: number, y: number) {
  if (calm()) return;
  const el = document.createElement("span");
  el.textContent = text;
  el.style.cssText =
    `position:absolute;left:${x}px;top:${y}px;white-space:nowrap;font:800 28px/1 var(--font-shout),"Arial Black",sans-serif;letter-spacing:-0.02em;` +
    "color:#ffcc00;-webkit-text-stroke:1.5px #1d0a0a;paint-order:stroke fill;text-shadow:3px 3px 0 #1d0a0a;";
  const tilt = (Math.random() - 0.5) * 24;
  const a = el.animate(
    [
      { transform: `translate(-50%,-50%) scale(0.2) rotate(${tilt}deg)`, opacity: 0 },
      { transform: `translate(-50%,-130%) scale(1.15) rotate(${tilt}deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(-50%,-190%) scale(1) rotate(${tilt * 0.6}deg)`, opacity: 1, offset: 0.7 },
      { transform: `translate(-50%,-260%) scale(0.9) rotate(${tilt * 0.4}deg)`, opacity: 0 },
    ],
    { duration: 1100, easing: "cubic-bezier(.2,.9,.3,1)" },
  );
  getLayer().appendChild(el);
  a.onfinish = () => el.remove();
}

const SHOUTS = ["FIGHT ON!", "BOOM", "LET'S GO", "✌️✌️✌️", "YEEHAW", "SEND IT", "TROJAN UP"];

/** Mounted once in the root layout. Gives every press a reaction. */
export function FxLayer() {
  useEffect(() => {
    let presses = 0;
    function onDown(e: PointerEvent) {
      const t = e.target as Element | null;
      const el = t?.closest?.('button, a, summary, label, [role="tab"], [role="radio"], [role="switch"]') as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled || el.dataset.fx === "none") return;
      const kind = el.dataset.fx;
      if (kind === "boom") boom(e.clientX, e.clientY);
      else if (kind === "rain") {
        boom(e.clientX, e.clientY);
        rain();
      } else burst(e.clientX, e.clientY, 9, 0.85);
      // Every so often, a hit marker. You never know which press gets one.
      presses++;
      if (kind === "boom" || kind === "rain" || presses % 5 === 0) shout(pick(SHOUTS), e.clientX, e.clientY - 12);
    }
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}
