import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, display, mono, s } from "./theme";

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Spring-in from `at` seconds (relative to the current Sequence). */
export const useIn = (at: number, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - s(at), fps, config: { damping, stiffness: 140, mass: 0.7 } });
};

export const Pop: React.FC<{ at: number; children: React.ReactNode; from?: "up" | "left" | "scale"; style?: React.CSSProperties }> = ({
  at,
  children,
  from = "up",
  style,
}) => {
  const p = useIn(at);
  const t =
    from === "left"
      ? `translateX(${interpolate(p, [0, 1], [-50, 0])}px)`
      : from === "scale"
        ? `scale(${interpolate(p, [0, 1], [0.7, 1])})`
        : `translateY(${interpolate(p, [0, 1], [34, 0])}px)`;
  return <div style={{ opacity: Math.min(1, p * 1.4), transform: t, filter: `blur(${interpolate(p, [0, 1], [6, 0], clamp)}px)`, ...style }}>{children}</div>;
};

/** Slams in big then settles: for the punchy lines. */
export const Slam: React.FC<{ at: number; children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  at,
  children,
  size = 120,
  color = C.text,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - s(at), fps, config: { damping: 12, stiffness: 220, mass: 0.6 } });
  return (
    <div
      style={{
        fontFamily: display,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 0.98,
        letterSpacing: "-0.04em",
        color,
        opacity: p > 0.01 ? Math.min(1, p * 1.6) : 0,
        transform: `scale(${interpolate(p, [0, 1], [1.9, 1])})`,
        filter: `blur(${interpolate(p, [0, 0.6, 1], [16, 2, 0])}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Kinetic headline: words rise in one after another. */
export const Words: React.FC<{ text: string; at: number; size?: number; color?: string; hi?: string[]; step?: number; style?: React.CSSProperties }> = ({
  text,
  at,
  size = 64,
  color = C.text,
  hi = [],
  step = 0.07,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontFamily: display, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.035em", color, ...style }}>
      {text.split(" ").map((w, i) => {
        const p = spring({ frame: frame - s(at + i * step), fps, config: { damping: 15, stiffness: 160 } });
        const bare = (x: string) => x.replace(/[.,!?:]/g, "");
        const isHi = hi.some((h) => bare(w) === bare(h));
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.08em" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${interpolate(p, [0, 1], [105, 0])}%)`,
                color: isHi ? C.violet : undefined,
                whiteSpace: "pre",
              }}
            >
              {w}
              {i < text.split(" ").length - 1 ? " " : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Dark stage: drifting violet glow, dot grid, film grain, vignette. */
export const Bg: React.FC<{ glow?: number }> = ({ glow = 1 }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const x1 = 22 + Math.sin(t / 5) * 6;
  const y1 = 28 + Math.cos(t / 6) * 6;
  const x2 = 82 + Math.cos(t / 7) * 5;
  const y2 = 78 + Math.sin(t / 5.5) * 5;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(40% 50% at ${x1}% ${y1}%, rgba(139,123,255,${0.16 * glow}), transparent 70%), radial-gradient(35% 45% at ${x2}% ${y2}%, rgba(59,47,158,${0.22 * glow}), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.2px)",
          backgroundSize: "34px 34px",
          backgroundPosition: `${(frame * 0.15) % 34}px 0px`,
          maskImage: "radial-gradient(70% 70% at 50% 50%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(70% 70% at 50% 50%, black 30%, transparent 100%)",
        }}
      />
      <AbsoluteFill style={{ opacity: 0.055, mixBlendMode: "overlay" }}>
        <svg width="1920" height="1080">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={frame % 6} stitchTiles="stitch" />
          </filter>
          <rect width="1920" height="1080" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
    </AbsoluteFill>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.violet, style }) => (
  <div style={{ fontFamily: mono, fontSize: 20, letterSpacing: "0.16em", textTransform: "uppercase", color, fontWeight: 700, ...style }}>{children}</div>
);

export const H: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 64, style }) => (
  <div style={{ fontFamily: display, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.035em", color: C.text, ...style }}>{children}</div>
);

export const P: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 28, style }) => (
  <div style={{ fontFamily: display, fontWeight: 400, fontSize: size, lineHeight: 1.32, color: C.muted, ...style }}>{children}</div>
);

/** A beat in the left caption column: coloured dot + one line. */
export const Beat: React.FC<{ at: number; color?: string; children: React.ReactNode; size?: number }> = ({ at, color = C.violet, children, size = 25 }) => (
  <Pop at={at} from="left">
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        padding: "14px 18px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.035)",
        border: `1px solid ${C.line}`,
        fontFamily: display,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.25,
        color: C.text,
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: 99, background: color, marginTop: size * 0.42, flexShrink: 0, boxShadow: `0 0 14px ${color}` }} />
      <div>{children}</div>
    </div>
  </Pop>
);

export const Chip: React.FC<{ children: React.ReactNode; color?: string; bg?: string; size?: number; style?: React.CSSProperties }> = ({
  children,
  color = C.text,
  bg = C.panel,
  size = 24,
  style,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: "11px 18px",
      borderRadius: 12,
      background: bg,
      border: `1px solid ${C.line}`,
      fontFamily: display,
      fontWeight: 600,
      fontSize: size,
      color,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

export const M: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.violetSoft }) => (
  <span style={{ fontFamily: mono, fontSize: "0.86em", color, fontWeight: 500 }}>{children}</span>
);

export const Code: React.FC<{ lines: { t: string; c?: string }[]; at: number; step?: number; size?: number; title?: string; style?: React.CSSProperties }> = ({
  lines,
  at,
  step = 0.3,
  size = 22,
  title,
  style,
}) => {
  const frame = useCurrentFrame();
  const p = useIn(at - 0.15);
  return (
    <div
      style={{
        fontFamily: mono,
        fontSize: size,
        lineHeight: 1.6,
        background: "rgba(13,12,20,0.92)",
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        color: C.text,
        whiteSpace: "pre",
        overflow: "hidden",
        opacity: Math.min(1, p * 1.5),
        transform: `translateY(${interpolate(p, [0, 1], [20, 0])}px)`,
        boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
        ...style,
      }}
    >
      {title ? (
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.line}`, fontSize: size * 0.72, color: C.muted, letterSpacing: "0.04em" }}>{title}</div>
      ) : null}
      <div style={{ padding: "16px 22px" }}>
        {lines.map((l, i) => {
          const start = s(at + i * step);
          const n = Math.max(0, Math.min(l.t.length, Math.floor((frame - start) * 2.6)));
          return (
            <div key={i} style={{ color: l.c ?? C.text, minHeight: size * 1.6 }}>
              {l.t.slice(0, n)}
              {n > 0 && n < l.t.length ? <span style={{ color: C.violet }}>▍</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Small honesty tag: what the viewer is looking at. */
export const Tag: React.FC<{ kind: "rec" | "anim"; children: React.ReactNode; style?: React.CSSProperties }> = ({ kind, children, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      fontFamily: mono,
      fontSize: 16,
      fontWeight: 700,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: kind === "rec" ? "#ffd7d8" : C.violetSoft,
      background: kind === "rec" ? "rgba(255,90,95,0.14)" : "rgba(139,123,255,0.12)",
      border: `1px solid ${kind === "rec" ? "rgba(255,90,95,0.45)" : "rgba(139,123,255,0.4)"}`,
      padding: "6px 12px",
      borderRadius: 999,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    <span style={{ width: 8, height: 8, borderRadius: 99, background: kind === "rec" ? C.red : C.violet }} />
    {children}
  </div>
);

/** Corner label for every motion-graphics scene. */
export const AnimLabel: React.FC<{ children?: React.ReactNode }> = ({ children = "Motion graphic" }) => (
  <div style={{ position: "absolute", right: 56, bottom: 44 }}>
    <Tag kind="anim">{children}</Tag>
  </div>
);

/** Leash mark: a violet badge holding an "L" whose foot ends in a leash clasp. */
export const LeashMark: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = C.violet }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <rect x="1" y="1" width="38" height="38" rx="11" fill={color} />
    <path d="M14 9.5 V24.5 Q14 30 19.5 30 H24.5" fill="none" stroke="#0b0a12" strokeWidth="4.6" strokeLinecap="round" />
    <circle cx="29" cy="30" r="3.6" fill="none" stroke="#0b0a12" strokeWidth="3" />
  </svg>
);

/* ---------- camera + callouts over real footage ---------- */

export type Cam = { t: number; x: number; y: number; z: number; d?: number };
export type Callout = {
  from: number;
  to?: number;
  box: [number, number, number, number]; // x, y, w, h in reference space (1280×720 for desktop takes)
  label?: string;
  color?: string;
  side?: "top" | "bottom";
  align?: "left" | "right";
  spot?: boolean;
};

const camAt = (cams: Cam[], t: number, W: number, H: number) => {
  let cur = { x: cams[0].x, y: cams[0].y, z: cams[0].z };
  for (const k of cams.slice(1)) {
    const p = ease(Math.min(1, Math.max(0, (t - k.t) / (k.d ?? 0.9))));
    cur = { x: cur.x + (k.x - cur.x) * p, y: cur.y + (k.y - cur.y) * p, z: cur.z + (k.z - cur.z) * p };
  }
  const hw = W / (2 * cur.z);
  const hh = H / (2 * cur.z);
  return { z: cur.z, x: Math.min(W - hw, Math.max(hw, cur.x)), y: Math.min(H - hh, Math.max(hh, cur.y)) };
};

/** Real footage, with an eased camera and callouts mapped through the same transform. */
export const Screen: React.FC<{
  clip: string;
  w: number; // on-screen width
  h: number;
  refW: number; // reference coordinate space of the clip
  refH: number;
  cams?: Cam[];
  callouts?: Callout[];
  radius?: number;
}> = ({ clip, w, h, refW, refH, cams = [{ t: 0, x: refW / 2, y: refH / 2, z: 1 }], callouts = [], radius = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cam = camAt(cams, t, refW, refH);
  const k = w / refW;
  const map = (x: number, y: number) => [w / 2 + (x - cam.x) * k * cam.z, h / 2 + (y - cam.y) * k * cam.z];
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: radius, background: "#fff" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height: h,
          transformOrigin: "0 0",
          transform: `translate(${w / 2 - cam.x * k * cam.z}px, ${h / 2 - cam.y * k * cam.z}px) scale(${cam.z})`,
        }}
      >
        <OffthreadVideo src={staticFile(clip)} muted style={{ width: w, height: h, display: "block" }} />
      </div>
      {callouts.map((c, i) => {
        if (t < c.from - 0.05 || (c.to !== undefined && t > c.to + 0.3)) return null;
        const pin = spring({ frame: frame - s(c.from), fps, config: { damping: 13, stiffness: 170 } });
        const pout = c.to === undefined ? 1 : interpolate(t, [c.to, c.to + 0.25], [1, 0], clamp);
        const [x, y] = map(c.box[0], c.box[1]);
        const bw = c.box[2] * k * cam.z;
        const bh = c.box[3] * k * cam.z;
        const col = c.color ?? C.violet;
        const pad = 8;
        const sc = interpolate(pin, [0, 1], [1.18, 1]);
        return (
          <div key={i} style={{ position: "absolute", left: x - pad, top: y - pad, width: bw + pad * 2, height: bh + pad * 2, opacity: pin * pout }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 12,
                border: `3px solid ${col}`,
                transform: `scale(${sc})`,
                boxShadow: `0 0 0 5px ${col}26, 0 0 34px ${col}88${c.spot ? ", 0 0 0 4000px rgba(7,7,11,0.42)" : ""}`,
              }}
            />
            {c.label ? (
              <div
                style={{
                  position: "absolute",
                  ...(c.align === "right" ? { right: -3 } : { left: -3 }),
                  ...(c.side === "bottom" ? { top: bh + pad * 2 + 10 } : { bottom: bh + pad * 2 + 10 }),
                  fontFamily: mono,
                  fontWeight: 700,
                  fontSize: 19,
                  letterSpacing: "0.04em",
                  color: "#0b0a12",
                  background: col,
                  padding: "7px 13px",
                  borderRadius: 9,
                  whiteSpace: "nowrap",
                  boxShadow: `0 8px 24px rgba(0,0,0,0.35)`,
                  transform: `translateY(${interpolate(pin, [0, 1], [10, 0])}px)`,
                }}
              >
                {c.label}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/** Browser window chrome around a desktop take. */
export const Browser: React.FC<{ url: string; speed: number; w: number; dark?: boolean; title?: string; children: React.ReactNode }> = ({
  url,
  speed,
  w,
  dark,
  title,
  children,
}) => (
  <div
    style={{
      width: w,
      borderRadius: 18,
      overflow: "hidden",
      background: dark ? "#0b0d12" : "#16151f",
      boxShadow: "0 60px 140px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.08), 0 0 120px rgba(139,123,255,0.16)",
    }}
  >
    <div style={{ height: 50, display: "flex", alignItems: "center", gap: 18, padding: "0 18px", background: "#16151f", borderBottom: "1px solid #24222f" }}>
      <div style={{ display: "flex", gap: 9 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 17, color: C.muted, background: "#0e0d15", border: "1px solid #24222f", borderRadius: 9, padding: "6px 18px", minWidth: 380, textAlign: "center" }}>
          {title ?? url}
        </div>
      </div>
      <Tag kind="rec">Real UI · unedited · {speed}×</Tag>
    </div>
    {children}
  </div>
);

/** Phone frame around the phone-width take. */
export const Phone: React.FC<{ h: number; speed: number; children: React.ReactNode }> = ({ h, speed, children }) => {
  const w = (h * 1170) / 2532;
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          width: w + 26,
          height: h + 26,
          borderRadius: 62,
          background: "#050507",
          padding: 13,
          boxShadow: "0 50px 120px rgba(0,0,0,0.6), 0 0 0 2px #2b2838, 0 0 100px rgba(139,123,255,0.18)",
        }}
      >
        <div style={{ width: w, height: h, borderRadius: 50, overflow: "hidden", position: "relative" }}>
          {children}
          <div style={{ position: "absolute", top: 12, left: "50%", marginLeft: -60, width: 120, height: 34, borderRadius: 99, background: "#050507" }} />
        </div>
      </div>
      <div style={{ position: "absolute", top: -48, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <Tag kind="rec">Real UI · {speed}×</Tag>
      </div>
    </div>
  );
};

/* ---------- top chapter bar ---------- */

export const CHAPTERS = ["Inject", "Allow", "Escalate", "Approve", "Retry", "Ledger", "Policy", "Proof", "Tests"];

export const Chapters: React.FC<{ active: number }> = ({ active }) => (
  <div style={{ position: "absolute", left: 96, right: 96, top: 44, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <LeashMark size={34} />
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 30, letterSpacing: "-0.03em", color: C.text }}>Leash</div>
    </div>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {CHAPTERS.map((name, i) => (
        <div
          key={name}
          style={{
            fontFamily: mono,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: i === active ? "#0b0a12" : i < active ? C.text : C.dim,
            background: i === active ? C.violet : "transparent",
            border: `1px solid ${i === active ? C.violet : i < active ? "#3a3750" : C.line}`,
            padding: "6px 11px",
            borderRadius: 8,
          }}
        >
          {String(i + 1).padStart(2, "0")} {name}
        </div>
      ))}
    </div>
  </div>
);

/** Scene envelope: entrance and exit for footage scenes. */
export const useEnvelope = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const inP = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const out = interpolate(frame, [durationInFrames - 7, durationInFrames], [1, 0], clamp);
  return { inP, out };
};
