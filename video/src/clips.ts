/* The footage table. Keep in sync with video/cut_clips.sh (same name, source, start, end, speed).
   Sources are the unedited Playwright screen recordings in /recording (not in git), 30 fps.
   A footage scene lasts exactly as long as its clip: (end - start) / speed. */
export const CLIPS = {
  c1_inject: { src: "desktop", start: 0.4, end: 11.6, speed: 1.4 },
  c2_allow: { src: "desktop", start: 11.8, end: 19.0, speed: 1.4 },
  c3_escalate: { src: "desktop", start: 19.1, end: 26.0, speed: 1.2 },
  c4_phone: { src: "phone", start: 0.0, end: 13.4, speed: 1.5 },
  c5_retry: { src: "desktop", start: 42.3, end: 47.4, speed: 1.0 },
  c6_ledger: { src: "desktop", start: 47.5, end: 56.3, speed: 1.4 },
  c7_mandate: { src: "desktop", start: 56.4, end: 63.1, speed: 1.2 },
  c8_author: { src: "desktop", start: 63.2, end: 77.8, speed: 1.8 },
  c9_proof: { src: "proof", start: 0.4, end: 12.6, speed: 1.3 },
  c10_tests: { src: "terminal", start: 0.5, end: 21.7, speed: 2.0 },
} as const;

export type ClipName = keyof typeof CLIPS;
export const clipSeconds = (n: ClipName) => (CLIPS[n].end - CLIPS[n].start) / CLIPS[n].speed;
/** seconds in the sped-up clip at which a moment of the source recording appears */
export const at = (n: ClipName, sourceSec: number) => (sourceSec - CLIPS[n].start) / CLIPS[n].speed;
