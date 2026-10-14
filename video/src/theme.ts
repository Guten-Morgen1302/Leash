import { loadFont as loadDisplay } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const display = loadDisplay("normal", { weights: ["400", "500", "700", "800"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily;

export const C = {
  bg: "#07070b",
  bg2: "#0e0d16",
  panel: "#12111b",
  panel2: "#191826",
  line: "#262436",
  text: "#f4f3f8",
  muted: "#8e8ba3",
  dim: "#5d5a73",
  violet: "#8b7bff", // Leash violet: the one accent
  violetSoft: "#b4a9ff",
  violetDeep: "#3b2f9e",
  // the app's own outcome colours, used only for outcomes
  green: "#3ddc97",
  red: "#ff5a5f",
  amber: "#ffb547",
};

export const FPS = 30;
export const s = (seconds: number) => Math.round(seconds * FPS);
