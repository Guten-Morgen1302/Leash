#!/usr/bin/env bash
# Cuts the raw Playwright screen recordings in /recording (not in git) into the sped-up clips the video uses.
# Keep this table in sync with video/src/clips.ts.   name  source  start  end  speed
# Nothing private is on screen in these takes (checked frame by frame), so no blur pass is needed;
# if a future take shows something private, blur it with crop+boxblur+overlay as in blur() below.
set -euo pipefail
cd "$(dirname "$0")/.."
FFMPEG=${FFMPEG:-ffmpeg}
R=recording
O=video/public/clips
mkdir -p "$O" video/public/thumb

cut() { # name src start end speed [scale]
  "$FFMPEG" -v error -y -ss "$3" -to "$4" -i "$R/$2.mp4" -an \
    -vf "setpts=PTS/$5,fps=30${6:+,scale=$6}" \
    -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p -movflags +faststart "$O/$1.mp4"
}

cut c1_inject   desktop  0.4  11.6 1.4   # ticket 2 (injected): run both lanes → $200 vs BLOCKED R-HARD-MAX
cut c2_allow    desktop 11.8  19.0 1.4   # ticket 1: $18 allowed
cut c3_escalate desktop 19.1  26.0 1.2   # ticket 3: $75 → waiting for approval
cut c4_phone    phone    0.0  13.4 1.5 780:1688  # approval page at phone width, tap Approve
cut c5_retry    desktop 42.3  47.4 1.0   # agent retries after approval → $75 R-APPROVED
cut c6_ledger   desktop 47.5  56.3 1.4   # /ledger: chain verified
cut c7_mandate  desktop 56.4  63.1 1.2   # /mandate: plain-language limits
cut c8_author   desktop 63.2  77.8 1.8   # /author: apparel sample, recorded compile
cut c9_proof    proof    0.4  12.6 1.3   # /proof on the LIVE-FIRE server: refunds re-read from PayPal
cut c10_tests   terminal 0.5  21.7 2.0   # npm test (103 pass), npm run replay

# Thumbnail stills: real frames from the same takes
"$FFMPEG" -v error -y -ss 9.5 -i "$R/desktop.mp4" -frames:v 1 -vf "crop=1578:690:171:390" video/public/thumb/lanes.png
"$FFMPEG" -v error -y -ss 1.5 -i "$R/phone.mp4" -frames:v 1 -vf "scale=440:-2" video/public/thumb/phone.png

# blur(): kept for future takes. usage: blur clip x y w h from to
blur() {
  "$FFMPEG" -v error -y -i "$O/$1.mp4" -filter_complex \
    "[0:v]split[a][b];[b]crop=$4:$5:$2:$3,boxblur=24:3[bl];[a][bl]overlay=$2:$3:enable='between(t,$6,$7)'" \
    -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p "$O/$1.tmp.mp4"
  mv "$O/$1.tmp.mp4" "$O/$1.mp4"
}
echo "clips → $O"
