import json, subprocess, os, re, sys
SP = r"C:\Users\harsh\AppData\Local\Temp\claude\c--Hackathons-PayPal-AI-Hackathon\042f2538-49c1-4c53-8cc3-87c3fec9e8f2\scratchpad"
RUNNER = os.path.expanduser("~/.claude/skills/gstack/bin/gstack-claude-code").replace(chr(92), "/")
FIELDS = ["perActionCapCents", "hardMaxCents", "dailyCapCents", "hardDailyCapCents", "returnWindowDays", "blockIfOpenDispute", "escalateFullOrder"]
def ask(prompt, name, timeout=240000):
    p = os.path.join(SP, name); open(p, "w", encoding="utf-8").write(prompt)
    o = subprocess.run(["bun", RUNNER, "--cwd", SP, "--access", "read-only", "--timeout-ms", str(timeout)], stdin=open(p, encoding="utf-8"), capture_output=True, text=True, encoding="utf-8")
    return json.loads(o.stdout.strip().splitlines()[-1])["result"]

# 1) independent author writes policies + ground truth, blind to the compiler prompt
author = """IMPORTANT: do not read files. You are helping test a tool that converts a small online merchant's refund policy, written in plain English, into numbers. Write 10 DIFFERENT realistic policies as real shop owners would write them in a settings box: vary length, tone, typos, formatting, currency words ('bucks', 'USD', '$'), number formats ('$1,200', '2k', 'fifty'), and structure (bullets, one paragraph, rambling). Include exactly these hard cases: two policies that never mention a daily limit; one that never mentions disputes; one that says only 'refund anything reasonable' for the per-refund limit; one with a limit stated in a non-dollar way (percent of order) that cannot be a fixed cent amount; one that contradicts itself on the return window. For each policy also provide the ground-truth value of these fields, using null whenever the policy does NOT clearly determine the value: perActionCapCents (largest refund an AI agent may issue alone, in cents), hardMaxCents (largest refund ever allowed even with human approval, cents), dailyCapCents (agent-alone refunds per 24h, cents), hardDailyCapCents (absolute per 24h, cents), returnWindowDays (integer), blockIfOpenDispute (true/false), escalateFullOrder (true if refunding a whole order needs a human, else false). Return ONLY a JSON array of 10 objects with keys text and truth (object with the 7 keys)."""
pp = os.path.join(SP, "cold-policies.json")
if os.path.exists(pp):
    arr = json.load(open(pp))
else:
    arr = json.loads(re.search(r"\[.*\]", ask(author, "cold-author.txt"), flags=re.S).group(0)); json.dump(arr, open(pp, "w"), indent=1)

COMPILE = """IMPORTANT: do not read files. Convert the merchant's plain-English refund policy into JSON. Output ONLY one JSON object with exactly these keys: perActionCapCents (largest refund the AI agent may issue alone, integer cents), hardMaxCents (largest refund ever allowed even with human approval, integer cents), dailyCapCents (agent-alone refunds per 24h, integer cents), hardDailyCapCents (absolute refunds per 24h, integer cents), returnWindowDays (integer), blockIfOpenDispute (true/false), escalateFullOrder (true/false), questions (array of short clarifying questions). RULE: if the policy does not CLEARLY determine a field (missing, vague, contradictory, or not expressible as a fixed amount), set that field to null and add one question about it. Never guess a value.\n\nPolicy:\n"""
from concurrent.futures import ThreadPoolExecutor
def comp(i):
    try: return json.loads(re.search(r"\{.*\}", ask(COMPILE + arr[i]["text"], f"cold-c{i}.txt", 150000), flags=re.S).group(0))
    except Exception: return None
with ThreadPoolExecutor(5) as ex: gots = list(ex.map(comp, range(len(arr))))
tot = ok = guessed = missed_flag = exact_cases = parse_fail = 0; rows = []
for i, a in enumerate(arr):
    got = gots[i]
    if got is None:
        parse_fail += 1; rows.append((i, "PARSE FAIL")); continue
    bad = {}
    for f in FIELDS:
        t, g = a["truth"].get(f), got.get(f)
        tot += 1
        if t is None and g is not None: guessed += 1; bad[f] = ("GUESSED", g)
        elif t is not None and g is None: missed_flag += 1; bad[f] = ("over-flagged (null)", t)
        elif t != g: bad[f] = (g, t)
        else: ok += 1
    exact_cases += (not bad); rows.append((i, "exact" if not bad else bad))
for r in rows: print(r)
print(f"\nfields correct {ok}/{tot}; GUESSED where policy was unclear: {guessed}; over-flagged (asked when it was clear): {missed_flag}; fully-correct policies {exact_cases}/{len(arr)}; parse failures {parse_fail}")
