#!/usr/bin/env bash
# Generates out/music.wav: a royalty-free beat synthesized from scratch with ffmpeg aevalsrc.
# 0–6 s riser under the cold open, then kick / hat / snare / bass / pad at 120 BPM in A minor, exactly the video's length,
# fade-out over the end card, then a limiter. Usage: bash make_music.sh <seconds>   (default: the Main composition length)
set -euo pipefail
cd "$(dirname "$0")"
FFMPEG=${FFMPEG:-ffmpeg}
D=${1:-123.4}
mkdir -p out
K='mod(t,0.5)'
# bass root per 2-bar phrase: A, F, C, G
R='if(lt(mod(t,8),2),55,if(lt(mod(t,8),4),43.65,if(lt(mod(t,8),6),65.41,49)))'
PUMP="(0.25+0.75*min(1,$K*4))"
KICK="0.95*sin(2*PI*48*$K+7*(1-exp(-$K*40)))*exp(-$K*9)"
HAT="0.07*(2*random(0)-1)*exp(-mod(t+0.25,0.5)*90)+0.035*(2*random(3)-1)*exp(-mod(t,0.125)*140)"
SNARE="(0.20*(2*random(1)-1)+0.10*sin(2*PI*190*mod(t-0.5,1)))*exp(-mod(t-0.5,1)*24)*gte(t-0.5,0)"
BASS="0.28*sin(2*PI*$R*t)*$PUMP"
PAD="0.06*(sin(2*PI*$R*4*t)+0.6*sin(2*PI*$R*4.757*t)+0.5*sin(2*PI*$R*6*t))*$PUMP"
RISER="(0.08*(2*random(2)-1)*(t/6)^2+0.07*sin(2*PI*(80+60*t)*t)*(t/6))"
EXPR="if(lt(t,6),$RISER,$KICK+$HAT+$SNARE+$BASS+$PAD)*0.5"
FADE=$(python -c "print(max(0, $D - 5))")
"$FFMPEG" -v error -y -f lavfi -i "aevalsrc='$EXPR':s=44100:d=$D" \
  -af "lowpass=f=9500,highpass=f=30,afade=t=in:d=0.4,afade=t=out:st=$FADE:d=5,alimiter=limit=0.8" -ac 2 out/music.wav
echo "wrote out/music.wav ($D s)"
