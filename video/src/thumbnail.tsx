import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { LeashMark } from "./ui";
import { C, display, mono } from "./theme";

/** YouTube thumbnail 1280×720: both screenshots are real frames from the recording (video/public/thumb, cut by cut_clips.sh). */
const Shot: React.FC<{ src: string; rotate: number; left: number; top: number; w: number; h: number; radius: number; pos?: string }> = ({
  src,
  rotate,
  left,
  top,
  w,
  h,
  radius,
  pos = "center",
}) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: w + 14,
      height: h + 14,
      padding: 7,
      borderRadius: radius + 7,
      background: "#050507",
      transform: `rotate(${rotate}deg)`,
      boxShadow: "0 30px 70px rgba(0,0,0,0.65), 0 0 0 2px #2b2838, 0 0 60px rgba(139,123,255,0.25)",
    }}
  >
    <div style={{ width: w, height: h, borderRadius: radius, overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ width: w, height: h, objectFit: "cover", objectPosition: pos }} />
    </div>
  </div>
);

export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at 76% 42%, #2a1f6e 0%, ${C.bg} 58%)`, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 54, top: 50, width: 620 }}>
      <div style={{ display: "inline-block", fontFamily: mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.12em", color: "#0b0a12", background: C.violet, padding: "8px 16px", borderRadius: 10 }}>
        AI REFUND AGENT · PAYPAL
      </div>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 138, lineHeight: 0.9, letterSpacing: "-0.05em", color: C.text, marginTop: 30 }}>Injected.</div>
      <div style={{ fontFamily: display, fontWeight: 800, fontSize: 138, lineHeight: 0.9, letterSpacing: "-0.05em", color: C.violet, marginTop: 8 }}>Blocked.</div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 36, color: C.text, marginTop: 36, lineHeight: 1.2 }}>
        <span style={{ color: C.red, textDecoration: "line-through" }}>$200 refund</span> → <span style={{ color: C.green }}>$0 out</span>
      </div>
    </div>
    <Shot src="thumb/phone.png" rotate={-8} left={700} top={36} w={200} h={433} radius={30} pos="top" />
    <Shot src="thumb/lanes.png" rotate={5} left={600} top={272} w={640} h={280} radius={16} />
    <div
      style={{
        position: "absolute",
        left: 950,
        top: 528,
        fontFamily: mono,
        fontWeight: 700,
        fontSize: 30,
        color: "#fff",
        background: C.red,
        padding: "12px 20px",
        borderRadius: 14,
        transform: "rotate(-8deg)",
        boxShadow: "0 14px 40px rgba(255,90,95,0.55)",
        letterSpacing: "0.06em",
      }}
    >
      ✕ R-HARD-MAX
    </div>
    <div
      style={{
        position: "absolute",
        right: 34,
        bottom: 28,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: display,
        fontWeight: 800,
        fontSize: 36,
        color: C.text,
        background: "rgba(7,7,11,0.85)",
        padding: "10px 20px",
        borderRadius: 14,
        border: `2px solid ${C.violet}`,
      }}
    >
      <LeashMark size={34} /> Leash
    </div>
  </AbsoluteFill>
);
