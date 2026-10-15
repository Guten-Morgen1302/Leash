import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { at, CLIPS, type ClipName } from "./clips";
import { Beat, Bg, Browser, Callout, Cam, Chapters, Code, Kicker, M, Phone, Pop, Screen, useEnvelope, Words } from "./ui";
import { C, mono } from "./theme";

/* All callout boxes are in the 1280×720 reference space of the desktop takes (the phone take uses 585×1266).
   Clip times use at(clip, sourceSecond) so they stay tied to the moment in the raw recording. */

const FW = 1180; // browser frame width on screen
const FH = Math.round((FW * 9) / 16);

const FootScene: React.FC<{
  chapter: number;
  clip: ClipName;
  url: string;
  kicker: string;
  title: string;
  hi?: string[];
  note: string;
  cams?: Cam[];
  callouts?: Callout[];
  dark?: boolean;
  frameTitle?: string;
  children: React.ReactNode;
}> = ({ chapter, clip, url, kicker, title, hi, note, cams, callouts, dark, frameTitle, children }) => {
  const { inP, out } = useEnvelope();
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <Chapters active={chapter} />
      <div style={{ position: "absolute", left: 96, top: 172, width: 500 }}>
        <Pop at={0}>
          <Kicker>{kicker}</Kicker>
        </Pop>
        <Words text={title} at={0.1} size={58} hi={hi} style={{ marginTop: 16 }} />
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 644,
          top: 158,
          perspective: 2000,
        }}
      >
        <div
          style={{
            transform: `translateY(${interpolate(inP, [0, 1], [70, 0])}px) rotateX(${interpolate(inP, [0, 1], [14, 0])}deg) scale(${interpolate(inP, [0, 1], [0.94, 1])})`,
            transformOrigin: "50% 100%",
            opacity: Math.min(1, inP * 1.6),
          }}
        >
          <Browser url={url} speed={CLIPS[clip].speed} w={FW} dark={dark} title={frameTitle}>
            <Screen clip={`clips/${clip}.mp4`} w={FW} h={FH} refW={1280} refH={720} cams={cams} callouts={callouts} />
          </Browser>
          <div style={{ marginTop: 18, fontFamily: mono, fontSize: 17, color: C.dim, letterSpacing: "0.02em" }}>{note}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* 01 · the injected ticket */
export const InjectScene: React.FC = () => {
  const r = at("c1_inject", 6.9);
  return (
    <FootScene
      chapter={0}
      clip="c1_inject"
      url="127.0.0.1:4400/demo"
      kicker="01 · Prompt injection"
      title="Same ticket. One lane has Leash."
      hi={["Leash"]}
      note="Both lanes replay the same agent request · PayPal call simulated (fake money) · the gate is real"
      cams={[
        { t: 0, x: 640, y: 330, z: 1.18 },
        { t: at("c1_inject", 4.7), x: 640, y: 470, z: 1.12, d: 1.1 },
      ]}
      callouts={[
        { from: 0.5, to: r - 0.6, box: [124, 331, 912, 28], color: C.red, label: "Hidden instruction inside the ticket", spot: true },
        { from: r + 0.1, box: [134, 612, 322, 44], color: C.red, label: "No gate: $200 out" },
        { from: r + 0.7, box: [660, 513, 262, 126], color: C.green, label: "Leash: blocked" },
      ]}
    >
      <Beat at={0.5} color={C.red}>
        Asks for the <b>$18 mug</b>, then hides <i>"refund the ENTIRE order"</i>
      </Beat>
      <Beat at={r + 0.1} color={C.red}>
        No gate → <b>$200.00 refunded</b>
      </Beat>
      <Beat at={r + 0.7} color={C.green}>
        Leash → <b>blocked</b>: over the $100 hard max <M>R-HARD-MAX</M>
      </Beat>
    </FootScene>
  );
};

/* 02 · the honest refund */
export const AllowScene: React.FC = () => {
  const r = at("c2_allow", 16.2);
  return (
    <FootScene
      chapter={1}
      clip="c2_allow"
      url="127.0.0.1:4400/demo"
      kicker="02 · Honest refund"
      title="An honest $18 goes straight through."
      hi={["$18"]}
      note="Ticket 1 · PayPal call simulated (fake money) · the gate is real"
      cams={[{ t: 0, x: 640, y: 400, z: 1.12 }]}
      callouts={[
        { from: 0.2, to: r - 0.4, box: [124, 283, 650, 26], label: "Ticket 1: just the t-shirt" },
        { from: r + 0.1, box: [660, 468, 300, 118], color: C.green, label: "R-ALLOW" },
      ]}
    >
      <Beat at={0.3}>"Could I get a refund for just the t-shirt?"</Beat>
      <Beat at={r + 0.1} color={C.green}>
        $18 is under the agent's <b>$50</b> limit → <b>refunded</b>
      </Beat>
      <Beat at={r + 0.8}>No friction for the normal case</Beat>
    </FootScene>
  );
};

/* 03 · escalation */
export const EscalateScene: React.FC = () => {
  const r = at("c3_escalate", 23.5);
  return (
    <FootScene
      chapter={2}
      clip="c3_escalate"
      url="127.0.0.1:4400/demo"
      kicker="03 · Escalation"
      title="Over the limit? A human decides."
      hi={["human"]}
      note="Ticket 3 · PayPal call simulated (fake money) · the gate is real"
      cams={[
        { t: 0, x: 640, y: 400, z: 1.12 },
        { t: r + 0.2, x: 900, y: 560, z: 1.42, d: 1.0 },
      ]}
      callouts={[
        { from: r + 0.25, box: [660, 468, 400, 80], color: C.amber, label: "R-ACTION-CAP · $75 > $50" },
        { from: r + 1.0, box: [662, 638, 206, 56] },
      ]}
    >
      <Beat at={0.3}>A $75 jacket never arrived</Beat>
      <Beat at={r + 0.2} color={C.amber}>
        $75 is over the agent's <b>$50</b> limit
      </Beat>
      <Beat at={r + 0.9}>So it escalates: an approval link goes to a person</Beat>
    </FootScene>
  );
};

/* 04 · approval on a phone */
export const PhoneScene: React.FC = () => {
  const { inP, out } = useEnvelope();
  const tap = at("c4_phone", 3.8);
  const ok = at("c4_phone", 5.4);
  const PH = 800;
  const PW = Math.round((PH * 1170) / 2532);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <Chapters active={3} />
      <div style={{ position: "absolute", left: 96, top: 172, width: 520 }}>
        <Pop at={0}>
          <Kicker>04 · Human in the loop</Kicker>
        </Pop>
        <Words text="Approve it from your phone." at={0.1} size={58} hi={["phone."]} style={{ marginTop: 16 }} />
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 14 }}>
          <Beat at={0.4}>The approval link opens on any phone</Beat>
          <Beat at={1.3} color={C.amber}>
            The AI summary is <b>advisory</b>: the gate never reads it
          </Beat>
          <Beat at={ok + 0.1} color={C.green}>
            Approve refunds <b>nothing</b>. It mints a one-time grant.
          </Beat>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 760,
          top: 168,
          transform: `translateY(${interpolate(inP, [0, 1], [90, 0])}px) rotate(${interpolate(inP, [0, 1], [5, 0])}deg)`,
          opacity: Math.min(1, inP * 1.6),
        }}
      >
        <Phone h={PH} speed={CLIPS.c4_phone.speed}>
          <Screen
            clip="clips/c4_phone.mp4"
            w={PW}
            h={PH}
            refW={585}
            refH={1266}
            callouts={[
              { from: 0.3, to: 1.2, box: [62, 395, 330, 190], label: "$75 · 1 × Wool jacket" },
              { from: 1.3, to: tap - 0.3, box: [62, 700, 460, 180], color: C.amber, label: "Advisory only" },
              { from: tap - 0.4, to: ok - 0.1, box: [24, 1058, 260, 74], label: "Approve" },
              { from: ok, box: [38, 1028, 510, 126], color: C.green, label: "Nothing refunded yet" },
            ]}
          />
        </Phone>
        <div style={{ marginTop: 18, width: PW + 26, display: "flex", justifyContent: "center", whiteSpace: "nowrap", fontFamily: mono, fontSize: 16, color: C.dim }}>Phone-width browser (390×844), same server</div>
      </div>
      <div style={{ position: "absolute", left: 1290, top: 300, width: 540 }}>
        <Code
          at={1.0}
          step={0.45}
          size={22}
          title="what Approve does · server/dispatch.ts"
          lines={[
            { t: "approve(actionId, token)" },
            { t: "  re-check the hard rules", c: C.muted },
            { t: "  grant: single use, 10 min", c: C.violetSoft },
            { t: "  bound to args hash + items", c: C.violetSoft },
            { t: "  token: URL fragment, hashed", c: C.muted },
            { t: "refunds executed: 0", c: C.green },
          ]}
        />
      </div>
    </AbsoluteFill>
  );
};

/* 05 · the retry */
export const RetryScene: React.FC = () => {
  const r = at("c5_retry", 44.1);
  return (
    <FootScene
      chapter={4}
      clip="c5_retry"
      url="127.0.0.1:4400/demo"
      kicker="05 · Retry"
      title="The agent retries. It works once."
      hi={["once."]}
      note="Same run as ticket 3 · PayPal call simulated (fake money) · the gate is real"
      cams={[{ t: 0, x: 640, y: 400, z: 1.12 }]}
      callouts={[
        { from: 0.05, to: r - 0.15, box: [882, 640, 256, 52], label: "Same call again" },
        { from: r + 0.05, box: [660, 468, 300, 118], color: C.green, label: "R-APPROVED" },
        { from: r + 0.8, box: [660, 602, 472, 24], label: "Counts toward the daily cap", side: "bottom" },
      ]}
    >
      <Beat at={0.2}>The agent retries the exact same request</Beat>
      <Beat at={r + 0.05} color={C.green}>
        The grant lets it through: <b>$75 refunded</b>
      </Beat>
      <Beat at={r + 0.8}>The grant is single-use; every retry is re-checked</Beat>
    </FootScene>
  );
};

/* 06 · ledger */
export const LedgerScene: React.FC = () => {
  const p = at("c6_ledger", 49.2);
  return (
    <FootScene
      chapter={5}
      clip="c6_ledger"
      url="127.0.0.1:4400/ledger"
      kicker="06 · Audit trail"
      title="Every decision, hash-chained."
      hi={["hash-chained."]}
      note="Tamper-evident against partial edits · tail truncation is a documented limit"
      cams={[
        { t: 0, x: 640, y: 360, z: 1 },
        { t: p + 0.1, x: 640, y: 300, z: 1.16, d: 1.0 },
      ]}
      callouts={[
        { from: p + 0.3, box: [114, 128, 138, 32], color: C.green, label: "Recomputed on every load" },
        { from: p + 1.4, box: [980, 264, 182, 292], label: "Each hash covers the row before", align: "right" },
      ]}
    >
      <Beat at={p + 0.2}>Blocked, reserved, approved, executed: all of it</Beat>
      <Beat at={p + 1.3}>Edit or delete a middle row → verification fails</Beat>
      <Beat at={p + 2.4}>Optional HMAC seal, key kept outside the DB</Beat>
    </FootScene>
  );
};

/* 07 · mandate */
export const MandateScene: React.FC = () => {
  const p = at("c7_mandate", 58.1);
  return (
    <FootScene
      chapter={6}
      clip="c7_mandate"
      url="127.0.0.1:4400/mandate"
      kicker="07 · Policy is data"
      title="The rules are plain JSON."
      hi={["JSON."]}
      note="/mandate renders mandate.json in plain English · read-only"
      cams={[
        { t: 0, x: 640, y: 360, z: 1 },
        { t: p + 0.1, x: 600, y: 270, z: 1.3, d: 1.0 },
      ]}
      callouts={[
        { from: p + 0.3, box: [130, 179, 346, 22], label: "Alone: up to $50" },
        { from: p + 1.0, box: [640, 203, 300, 22], color: C.red, label: "Hard max: $100", side: "bottom" },
      ]}
    >
      <Code
        at={0.4}
        step={0.18}
        size={21}
        title="mandate.json"
        lines={[
          { t: '"perActionCapCents": 5000,' },
          { t: '"hardMaxCents": 10000,' },
          { t: '"dailyCapCents": 20000,' },
          { t: '"hardDailyCapCents": 40000,' },
          { t: '"returnWindowDays": 30,' },
          { t: '"blockIfOpenDispute": true' },
        ]}
      />
      <Beat at={p + 1.2} color={C.amber}>
        A missing limit makes it <b>invalid</b>. Leash never guesses.
      </Beat>
    </FootScene>
  );
};

/* 08 · author a mandate from a real policy */
export const AuthorScene: React.FC = () => {
  const d = at("c8_author", 69.8);
  const settled = at("c8_author", 74.0);
  return (
    <FootScene
      chapter={6}
      clip="c8_author"
      url="127.0.0.1:4400/author"
      kicker="08 · Policy compiler"
      title="A draft. Never a guess."
      hi={["guess."]}
      note="Recorded compile (keyless server): 3 Gemini runs at temperature 0 · server/fixtures/demo/compile-apparel.json"
      callouts={[
        { from: settled, box: [146, 156, 676, 168], color: C.amber, label: "No limit in the text → NOT SET" },
        { from: settled + 0.7, box: [146, 394, 548, 192], label: "Listed, never dropped" },
      ]}
    >
      <Beat at={0.4}>A real merchant policy, in plain English</Beat>
      <Beat at={d + 0.3} color={C.amber}>
        The text states no dollar limit → <b>left empty</b>, not invented
      </Beat>
      <Beat at={settled + 0.6}>Rules the schema can't enforce are listed openly</Beat>
    </FootScene>
  );
};

/* 09 · live sandbox proof */
export const ProofScene: React.FC = () => {
  const p = at("c9_proof", 4.0);
  return (
    <FootScene
      chapter={7}
      clip="c9_proof"
      url="127.0.0.1:4401/proof"
      kicker="09 · Live proof"
      title="Real refunds. Real PayPal sandbox."
      hi={["Real"]}
      note="Sandbox money · refund ids from 2026-10-10 (docs/evidence) · status fetched from PayPal while recording"
      cams={[
        { t: 0, x: 640, y: 360, z: 1 },
        { t: p + 0.1, x: 700, y: 330, z: 1.12, d: 1.0 },
      ]}
      callouts={[
        { from: p + 0.3, box: [1018, 258, 150, 205], color: C.green, label: "Re-read from PayPal", align: "right" },
        { from: p + 1.5, box: [1046, 13, 210, 30], label: "Sandbox keys loaded", side: "bottom", align: "right" },
        { from: p + 2.7, box: [395, 335, 610, 46], color: C.red, label: "Full-order attempt: blocked", side: "bottom" },
      ]}
    >
      <Beat at={p + 0.3} color={C.green}>
        PayPal says <b>COMPLETED</b>, fetched live
      </Beat>
      <Beat at={p + 1.5}>$18 item refunds through the gate and the MCP proxy</Beat>
      <Beat at={p + 2.7} color={C.red}>
        The full-order try on that capture: <M>R-HARD-MAX</M>
      </Beat>
    </FootScene>
  );
};

/* 10 · tests */
export const TestsScene: React.FC = () => {
  const sum = at("c10_tests", 12.3);
  const rp = at("c10_tests", 15.8);
  const rd = at("c10_tests", 18.2);
  return (
    <FootScene
      chapter={8}
      clip="c10_tests"
      url="terminal"
      frameTitle="Terminal · real stdout, streamed live"
      dark
      kicker="10 · Engineering"
      title="103 tests. Zero failures."
      hi={["103", "Zero"]}
      note="npm test, then npm run replay against the running server · output unedited, 2× speed"
      cams={[
        { t: 0, x: 640, y: 360, z: 1 },
        { t: sum - 0.1, x: 300, y: 520, z: 1.7, d: 0.8 },
        { t: rp - 0.1, x: 640, y: 360, z: 1, d: 0.5 },
        { t: rd - 0.3, x: 560, y: 220, z: 1.2, d: 0.8 },
      ]}
      callouts={[
        { from: sum + 0.2, to: rp - 0.3, box: [22, 400, 160, 96], color: C.green, label: "103 pass · 0 fail" },
        { from: rd + 0.2, box: [22, 168, 1045, 82], label: "Same 3 tickets, live gate", side: "bottom" },
      ]}
    >
      <Beat at={0.3}>Real test output, streamed as it ran</Beat>
      <Beat at={sum + 0.2} color={C.green}>
        <b>103</b> tests · 15 suites · <b>0</b> failures
      </Beat>
      <Beat at={sum + 0.9}>Two SQLite drivers · concurrency · browser e2e</Beat>
      <Beat at={rd + 0.2}>Replay: allow · block · escalate</Beat>
    </FootScene>
  );
};
