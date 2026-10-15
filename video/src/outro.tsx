import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimLabel, Bg, Chip, ease, Kicker, LeashMark, Pop, Slam, Words } from "./ui";
import { C, display, mono, s } from "./theme";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const NODES = [
  { h: "AI agent", code: 'refund_items(["mug"])', sub: "names items · no amount · no key" },
  { h: "Leash MCP proxy", code: "holds the PayPal token", sub: "unmapped PayPal tools don't exist" },
  { h: "Price it", code: "mug → $18.00", sub: "from trusted order data" },
  { h: "Decide + reserve", code: "BEGIN IMMEDIATE", sub: "live PayPal state read first" },
  { h: "PayPal refund", code: "PayPal-Request-Id", sub: "idempotent · result logged" },
];
const RULES = [
  "expiry", "mandate valid", "known capture", "currency", "over-capture", "duplicate", "open dispute",
  "return window", "HARD MAX", "hard daily cap", "approval grant", "stale state", "daily cap", "action cap",
];

/** How it works: one request, left to right. Server code paths from docs/Architecture/SYSTEM_ARCHITECTURE.md. */
export const HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const W = 300;
  const GAP = 57;
  const X0 = 96;
  const Y = 290;
  const RAIL = Y + 228;
  const pk = interpolate(t, [2.0, 6.2], [0, 4], { ...clamp, easing: ease });
  const px = X0 + W / 2 + pk * (W + GAP);
  return (
    <AbsoluteFill>
      <Bg />
      <div style={{ position: "absolute", left: 96, top: 96, width: 1728 }}>
        <Pop at={0}>
          <Kicker>How it works</Kicker>
        </Pop>
        <Words text="The agent names items. Leash computes the amount." at={0.15} size={64} hi={["items.", "amount."]} style={{ marginTop: 14 }} />
      </div>
      {/* rail */}
      <div style={{ position: "absolute", left: X0 + W / 2, top: RAIL, width: 4 * (W + GAP), height: 3, background: C.line }} />
      {NODES.map((n, i) => (
        <div key={`tick${n.h}`} style={{ position: "absolute", left: X0 + W / 2 + i * (W + GAP) - 7, top: RAIL - 6, width: 14, height: 14, borderRadius: 99, background: pk >= i - 0.05 ? C.violet : C.line }} />
      ))}
      <div
        style={{
          position: "absolute",
          left: X0 + W / 2,
          top: RAIL,
          width: Math.max(0, px - X0 - W / 2),
          height: 3,
          background: `linear-gradient(90deg, transparent, ${C.violet})`,
        }}
      />
      {NODES.map((n, i) => {
        const appear = spring({ frame: frame - s(0.7 + i * 0.18), fps, config: { damping: 14 } });
        const lit = pk >= i - 0.05;
        return (
          <div
            key={n.h}
            style={{
              position: "absolute",
              left: X0 + i * (W + GAP),
              top: Y,
              width: W,
              height: 190,
              borderRadius: 18,
              background: lit ? "#1a1730" : C.panel,
              border: `1.5px solid ${lit ? C.violet : C.line}`,
              boxShadow: lit ? "0 0 40px rgba(139,123,255,0.25)" : "none",
              padding: "20px 22px",
              opacity: appear,
              transform: `translateY(${interpolate(appear, [0, 1], [30, 0])}px)`,
            }}
          >
            <div style={{ fontFamily: mono, fontSize: 15, color: lit ? C.violetSoft : C.dim, letterSpacing: "0.12em" }}>STEP {i + 1}</div>
            <div style={{ fontFamily: display, fontWeight: 800, fontSize: 30, color: C.text, marginTop: 6, letterSpacing: "-0.02em" }}>{n.h}</div>
            <div style={{ fontFamily: mono, fontSize: 18, color: i === 1 ? C.amber : C.violetSoft, marginTop: 10 }}>{n.code}</div>
            <div style={{ fontFamily: display, fontSize: 18, color: C.muted, marginTop: 6 }}>{n.sub}</div>
          </div>
        );
      })}
      {t > 2.0 && t < 6.6 ? (
        <div
          style={{
            position: "absolute",
            left: px - 11,
            top: RAIL - 10,
            width: 22,
            height: 22,
            borderRadius: 99,
            background: C.violet,
            boxShadow: "0 0 24px 6px rgba(139,123,255,0.8)",
          }}
        />
      ) : null}
      {/* the key never leaves step 2 */}
      <Pop at={3.0} style={{ position: "absolute", left: X0 + (W + GAP) + 6, top: RAIL + 30 }}>
        <div style={{ fontFamily: mono, fontSize: 18, color: C.amber, background: "rgba(255,181,71,0.1)", border: "1px solid rgba(255,181,71,0.4)", padding: "8px 14px", borderRadius: 10 }}>
          the agent never sees the token
        </div>
      </Pop>
      {/* the rule ladder */}
      <div style={{ position: "absolute", left: 96, top: 660, width: 1728 }}>
        <Pop at={6.2}>
          <Kicker color={C.muted}>Then deterministic rules, in a fixed order · no model involved</Kicker>
        </Pop>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          {RULES.map((r, i) => {
            const p = spring({ frame: frame - s(6.4 + i * 0.16), fps, config: { damping: 14 } });
            const hard = r === "HARD MAX" || r === "open dispute";
            return (
              <div
                key={r}
                style={{
                  fontFamily: mono,
                  fontSize: 19,
                  fontWeight: 700,
                  color: hard ? C.red : C.text,
                  border: `1px solid ${hard ? "rgba(255,90,95,0.5)" : C.line}`,
                  background: hard ? "rgba(255,90,95,0.08)" : C.panel,
                  padding: "8px 13px",
                  borderRadius: 9,
                  opacity: p,
                  transform: `translateY(${interpolate(p, [0, 1], [16, 0])}px)`,
                }}
              >
                {r}
              </div>
            );
          })}
          <Pop at={9.0} from="scale">
            <div style={{ display: "flex", gap: 10, marginLeft: 12 }}>
              <Chip size={20} color="#0b0a12" bg={C.green} style={{ border: "none", padding: "8px 14px" }}>ALLOW</Chip>
              <Chip size={20} color="#0b0a12" bg={C.amber} style={{ border: "none", padding: "8px 14px" }}>ESCALATE</Chip>
              <Chip size={20} color="#0b0a12" bg={C.red} style={{ border: "none", padding: "8px 14px" }}>BLOCK</Chip>
            </div>
          </Pop>
        </div>
        <Pop at={10.0}>
          <div style={{ marginTop: 34, fontFamily: mono, fontSize: 24, color: C.text }}>
            <span style={{ color: C.violet }}>decide</span>(action, mandate, state)<span style={{ color: C.muted }}> · a pure function: no I/O, no LLM · server/policy.ts</span>
          </div>
        </Pop>
      </div>
      <AnimLabel>Motion graphic · flow from server/gate.ts</AnimLabel>
    </AbsoluteFill>
  );
};

const STATS: { n: number; pre?: string; suf?: string; label: string; sub: string; color?: string }[] = [
  { n: 103, label: "tests passing", sub: "both SQLite drivers · browser e2e" },
  { n: 0, suf: " / 20", label: "over-refunds when the agent names items", sub: "vs 14 / 20 when it picks the amount", color: C.violet },
  { n: 0, pre: "$", label: "over the legit refund", sub: "40 injected agent runs, real MCP proxy", color: C.green },
  { n: 3, label: "real PayPal sandbox refunds", sub: "re-read from PayPal: COMPLETED" },
  { n: 0, label: "dollar limits invented", sub: "policy compiler, 18 runs on 3 real policies" },
  { n: 100, label: "Lighthouse accessibility", sub: "on all four pages" },
];

export const Stats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Bg />
      <div style={{ position: "absolute", left: 96, top: 92 }}>
        <Pop at={0}>
          <Kicker>Measured, not claimed</Kicker>
        </Pop>
        <Words text="Built like it moves real money." at={0.1} size={64} hi={["real", "money."]} style={{ marginTop: 14 }} />
      </div>
      <div style={{ position: "absolute", left: 96, top: 290, width: 1728, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 22 }}>
        {STATS.map((st, i) => {
          const p = spring({ frame: frame - s(0.6 + i * 0.32), fps, config: { damping: 14 } });
          const v = Math.round(interpolate(p, [0, 1], [0, st.n], clamp));
          return (
            <div
              key={st.label}
              style={{
                borderRadius: 20,
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${C.line}`,
                padding: "26px 30px",
                height: 250,
                opacity: Math.min(1, p * 1.5),
                transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
              }}
            >
              <div style={{ fontFamily: display, fontWeight: 800, fontSize: 100, lineHeight: 1, letterSpacing: "-0.045em", color: st.color ?? C.text }}>
                {st.pre}
                {v}
                <span style={{ fontSize: 54, color: C.muted }}>{st.suf}</span>
              </div>
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 27, color: C.text, marginTop: 14 }}>{st.label}</div>
              <div style={{ fontFamily: mono, fontSize: 17, color: C.muted, marginTop: 8 }}>{st.sub}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 96, bottom: 120, display: "flex", gap: 12, flexWrap: "wrap", width: 1728 }}>
        {["Reserve, then execute", "Idempotent refunds", "Hash-chained ledger + HMAC seal", "Hooks fail closed (exit 2)", "Token never reaches the agent"].map((x, i) => (
          <Pop key={x} at={3.0 + i * 0.22}>
            <Chip size={21}>{x}</Chip>
          </Pop>
        ))}
      </div>
      <div style={{ position: "absolute", left: 96, bottom: 52, fontFamily: mono, fontSize: 16, color: C.dim }}>
        Small benchmarks, tickets we wrote · details and limits in docs/Product/IMPACT_AND_EVIDENCE.md and docs/Architecture/THREAT_MODEL.md
      </div>
      <AnimLabel>Numbers from the repo</AnimLabel>
    </AbsoluteFill>
  );
};

export const End: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fade = interpolate(frame, [durationInFrames - s(1.4), durationInFrames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Bg glow={1.3} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Slam at={0.2} size={112}>
          Give your agent a refund budget.
        </Slam>
        <Slam at={0.85} size={112} color={C.violet} style={{ marginTop: 10 }}>
          Not your PayPal keys.
        </Slam>
        <Pop at={2.0}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 70 }}>
            <LeashMark size={56} />
            <div style={{ fontFamily: display, fontWeight: 800, fontSize: 64, letterSpacing: "-0.04em", color: C.text }}>Leash</div>
          </div>
        </Pop>
        <Pop at={2.5}>
          <div style={{ fontFamily: mono, fontSize: 32, color: C.violetSoft, marginTop: 22 }}>github.com/Guten-Morgen1302/Leash</div>
        </Pop>
        <Pop at={3.0}>
          <div style={{ display: "flex", gap: 14, marginTop: 26 }}>
            <Chip size={22} style={{ fontFamily: mono }}>npm ci && npm run demo</Chip>
            <Chip size={22}>no keys needed</Chip>
            <Chip size={22}>PayPal sandbox only · MIT</Chip>
          </div>
        </Pop>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
