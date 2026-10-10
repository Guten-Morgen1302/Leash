import json, subprocess, os, re
from concurrent.futures import ThreadPoolExecutor
SP = r"C:\Users\harsh\AppData\Local\Temp\claude\c--Hackathons-PayPal-AI-Hackathon\042f2538-49c1-4c53-8cc3-87c3fec9e8f2\scratchpad"
RUNNER = os.path.expanduser("~/.claude/skills/gstack/bin/gstack-claude-code").replace(chr(92), "/")
P = {
 "P1-coffee": "Because coffee is perishable, we cannot accept returns on opened bags of whole bean or ground coffee unless the bag was damaged in transit or we sent the wrong roast. Unopened bags, mugs, and brewing gear can be returned within 14 days of delivery for a full refund back to your original payment method. If your order arrived broken, email us photos within 48 hours of delivery and we will ship a replacement or refund the broken item right away. Customers cover return postage for change-of-mind returns.",
 "P2-apparel": "We offer returns within 7 business days of delivery for store credit only. We do not do cash refunds. To qualify, apparel must be unwashed, unworn, and have original tags attached. All jewelry, hair accessories, and items bought on sale or marked down 30% or more are strictly final sale. If an item arrives with a manufacturer defect, notify us within 5 days and we will replace it or issue a full refund.",
 "P3-handmade": "Since every custom piece is made to order, personalized items are non-refundable once production starts. For standard stock items, returns are accepted within 30 days of delivery. Returns requested between 30 and 45 days incur a 15% restocking fee, and anything after 45 days will be rejected. Shipping fees are non-refundable. If something arrives damaged, send us a photo and we'll figure out a fair fix or refund the damaged part.",
}
BASE = """IMPORTANT: do not read files. Convert the merchant's plain-English refund policy into JSON. Output ONLY one JSON object with exactly these keys: perActionCapCents (largest refund the AI agent may issue alone, integer cents), hardMaxCents (largest refund ever allowed even with human approval, integer cents), dailyCapCents (agent-alone refunds per 24h, integer cents), hardDailyCapCents (absolute refunds per 24h, integer cents), returnWindowDays (integer calendar days), blockIfOpenDispute (true/false), escalateFullOrder (true/false), questions (array of short clarifying questions)%s. RULE: if the policy does not CLEARLY determine a field (missing, vague, contradictory, conditional, or not expressible as a fixed value), set that field to null and add one question about it. Never guess a value.\n\nPolicy:\n"""
VARIANTS = {"A-same-prompt-as-before": BASE % "", "B-with-unsupported-field": BASE % ", unsupported (array of short strings naming policy rules that CANNOT be expressed by these fields, such as store-credit-only refunds, restocking fees, item-category exclusions, condition requirements, replacement-instead-of-refund)"}
def ask(prompt, name):
    p = os.path.join(SP, name); open(p, "w", encoding="utf-8").write(prompt)
    o = subprocess.run(["bun", RUNNER, "--cwd", SP, "--access", "read-only", "--timeout-ms", "170000"], stdin=open(p, encoding="utf-8"), capture_output=True, text=True, encoding="utf-8")
    return json.loads(o.stdout.strip().splitlines()[-1])["result"]
def one(job):
    v, pid, rep = job
    try: return job, json.loads(re.search(r"\{.*\}", ask(VARIANTS[v] + P[pid], f"up-{v[:1]}-{pid}-{rep}.txt"), flags=re.S).group(0))
    except Exception as e: return job, None
jobs = [(v, pid, r) for v in VARIANTS for pid in P for r in (1, 2, 3)]
with ThreadPoolExecutor(6) as ex: res = list(ex.map(one, jobs))
json.dump([{"variant": j[0], "policy": j[1], "rep": j[2], "out": o} for j, o in res], open(os.path.join(SP, "user-policies-results.json"), "w"), indent=1)

# PRE-REGISTERED scoring (written before running)
CAPS = ["perActionCapCents", "hardMaxCents", "dailyCapCents", "hardDailyCapCents"]
def score(pid, o):
    bad = []; qs = " ".join(map(str, o.get("questions", []))).lower() + " " + " ".join(map(str, o.get("unsupported", []))).lower()
    for f in CAPS + ["blockIfOpenDispute", "escalateFullOrder"]:
        if o.get(f) is not None: bad.append(f"GUESSED {f}={o.get(f)}")
    w = o.get("returnWindowDays")
    if pid == "P1-coffee" and w not in (14, None): bad.append(f"window={w} (14 or null expected)")
    if pid == "P2-apparel" and w is not None and not re.search(r"business", qs): bad.append(f"window={w} but business-days ambiguity not flagged")
    if pid == "P3-handmade" and w not in (None, 45) : bad.append(f"window={w} (null or 45 expected; 30 drops the fee window)")
    if pid == "P3-handmade" and w is not None and "restock" not in qs: bad.append("window given but restocking fee not flagged")
    unsup = {"P1-coffee": r"open|perishab|categor|exclusion|condition|replace", "P2-apparel": r"store credit|credit|cash|final sale|condition|replace", "P3-handmade": r"restock|custom|personal|made.to.order|fair|photo|shipping"}[pid]
    flagged = bool(re.search(unsup, qs))
    return bad, flagged
tot = {v: dict(runs=0, clean=0, guesses=0, flagged=0) for v in VARIANTS}
for (v, pid, rep), o in res:
    if o is None: print(v, pid, rep, "PARSE FAIL"); continue
    bad, flagged = score(pid, o); t = tot[v]; t["runs"] += 1; t["clean"] += (not bad); t["guesses"] += len(bad); t["flagged"] += flagged
    print(f"{v[:1]} {pid:12} r{rep} window={o.get('returnWindowDays')} caps={[o.get(c) for c in CAPS]} dispute={o.get('blockIfOpenDispute')} full={o.get('escalateFullOrder')} | {'OK' if not bad else bad} | flags-nonschema-rules={flagged}")
print()
for v, t in tot.items(): print(v, t)
