import React from "react";
import { AbsoluteFill, Composition, Series } from "remotion";
import { clipSeconds } from "./clips";
import { AllowScene, AuthorScene, EscalateScene, InjectScene, LedgerScene, MandateScene, PhoneScene, ProofScene, RetryScene, TestsScene } from "./footage";
import { ColdOpen, Logo, Problem } from "./intro";
import { End, HowItWorks, Stats } from "./outro";
import { C, FPS, s } from "./theme";
import { Thumbnail } from "./thumbnail";

// Footage scenes last exactly as long as their clip (video/public/clips, cut by video/cut_clips.sh).
export const SCENES: { id: string; C: React.FC; d: number }[] = [
  { id: "cold-open", C: ColdOpen, d: s(6) },
  { id: "logo", C: Logo, d: s(4.5) },
  { id: "problem", C: Problem, d: s(8) },
  { id: "inject", C: InjectScene, d: s(clipSeconds("c1_inject")) },
  { id: "allow", C: AllowScene, d: s(clipSeconds("c2_allow")) },
  { id: "escalate", C: EscalateScene, d: s(clipSeconds("c3_escalate")) },
  { id: "phone", C: PhoneScene, d: s(clipSeconds("c4_phone")) },
  { id: "retry", C: RetryScene, d: s(clipSeconds("c5_retry")) },
  { id: "how", C: HowItWorks, d: s(14) },
  { id: "ledger", C: LedgerScene, d: s(clipSeconds("c6_ledger")) },
  { id: "mandate", C: MandateScene, d: s(clipSeconds("c7_mandate")) },
  { id: "author", C: AuthorScene, d: s(clipSeconds("c8_author")) },
  { id: "proof", C: ProofScene, d: s(clipSeconds("c9_proof")) },
  { id: "tests", C: TestsScene, d: s(clipSeconds("c10_tests")) },
  { id: "stats", C: Stats, d: s(10) },
  { id: "end", C: End, d: s(8) },
];

export const TOTAL = SCENES.reduce((a, b) => a + b.d, 0);

const Main: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Series>
      {SCENES.map(({ id, C: Scene, d }) => (
        <Series.Sequence key={id} name={id} durationInFrames={d}>
          <Scene />
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <>
    <Composition id="Main" component={Main} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={FPS} width={1280} height={720} />
  </>
);
