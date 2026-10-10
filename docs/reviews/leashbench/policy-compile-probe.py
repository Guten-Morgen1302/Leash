import json, subprocess, os, re
SP = r"C:\Users\harsh\AppData\Local\Temp\claude\c--Hackathons-PayPal-AI-Hackathon\042f2538-49c1-4c53-8cc3-87c3fec9e8f2\scratchpad"
RUNNER = os.path.expanduser("~/.claude/skills/gstack/bin/gstack-claude-code")
SCHEMA = """Output ONLY a JSON object with exactly these keys (integers are cents or days; booleans true/false):
perActionCapCents (largest refund the agent may issue alone), hardMaxCents (largest refund ever allowed even with human approval), dailyCapCents (agent-alone refunds per 24h before a human must approve), hardDailyCapCents (absolute refunds per 24h, never exceeded), returnWindowDays (refund only within N days of purchase), blockIfOpenDispute (refuse refunds on payments with an open dispute), escalateFullOrder (a refund of every item of an order needs a human)."""
CASES = [
 ("We trust the agent with refunds up to $40 by itself. Anything bigger up to $150 needs a person to approve it. We never refund more than $150 on a single order. Keep total automatic refunds under $300 a day, and never go over $600 a day even with approval. We accept returns for 30 days. If the customer opened a PayPal dispute, don't refund, the dispute handles it. Refunding a whole order always needs a person.",
  dict(perActionCapCents=4000, hardMaxCents=15000, dailyCapCents=30000, hardDailyCapCents=60000, returnWindowDays=30, blockIfOpenDispute=True, escalateFullOrder=True)),
 ("Small shop. The bot can refund up to twenty-five dollars on its own. Up to a hundred dollars with my OK. Never above a hundred. Daily: bot alone max two hundred dollars, absolute max four hundred. 14 day return window. Ignore disputes, I handle them myself. Full-order refunds are fine for the bot only if under its limit, otherwise ask me.",
  dict(perActionCapCents=2500, hardMaxCents=10000, dailyCapCents=20000, hardDailyCapCents=40000, returnWindowDays=14, blockIfOpenDispute=False, escalateFullOrder=False)),
 ("Refunds: agent alone up to $10.00. With approval up to $75.50. Hard stop at $75.50. Daily the agent alone can do $100, hard daily limit $250. 60 days. Open disputes block refunds. Any full order refund goes to a human.",
  dict(perActionCapCents=1000, hardMaxCents=7550, dailyCapCents=10000, hardDailyCapCents=25000, returnWindowDays=60, blockIfOpenDispute=True, escalateFullOrder=True)),
 ("Premium store: agent may refund anything up to $500 alone. Nothing above $2,000 ever. Per day, automatic up to $1,500, absolute ceiling $5,000. Customers have 90 days. If there is an open dispute do not refund. Full orders need a person.",
  dict(perActionCapCents=50000, hardMaxCents=200000, dailyCapCents=150000, hardDailyCapCents=500000, returnWindowDays=90, blockIfOpenDispute=True, escalateFullOrder=True)),
 ("Be careful with money: nothing automatic over $5, nothing at all over $30. Total automatic refunds per day $20, hard daily max $60. One week return window. Disputes block refunds. Full refunds need a human.",
  dict(perActionCapCents=500, hardMaxCents=3000, dailyCapCents=2000, hardDailyCapCents=6000, returnWindowDays=7, blockIfOpenDispute=True, escalateFullOrder=True)),
 ("The agent can refund up to 30 bucks by itself, a human must okay up to 120, and refunds above 120 are never allowed. Auto refunds are limited to 150 dollars per day and 300 dollars absolute per day. Return window is 21 days. Open dispute means no refund. We want a person for whole-order refunds.",
  dict(perActionCapCents=3000, hardMaxCents=12000, dailyCapCents=15000, hardDailyCapCents=30000, returnWindowDays=21, blockIfOpenDispute=True, escalateFullOrder=True)),
]
ok_fields = tot_fields = ok_cases = 0; rows = []
for i, (text, truth) in enumerate(CASES):
    prompt = "IMPORTANT: do not read files. " + SCHEMA + "\n\nMerchant's refund policy in plain English:\n" + text
    p = os.path.join(SP, f"cp{i}.txt"); open(p, "w", encoding="utf-8").write(prompt)
    out = subprocess.run(["bun", RUNNER.replace(chr(92), "/"), "--cwd", SP, "--access", "read-only", "--timeout-ms", "120000"], stdin=open(p, encoding="utf-8"), capture_output=True, text=True, encoding="utf-8")
    try:
        res = json.loads(out.stdout.strip().splitlines()[-1])["result"]; got = json.loads(re.search(r"\{.*\}", res, flags=re.S).group(0))
    except Exception as e:
        rows.append((i, "PARSE FAIL", str(e)[:60])); tot_fields += len(truth); continue
    bad = {k: (got.get(k), v) for k, v in truth.items() if got.get(k) != v}
    ok_fields += len(truth) - len(bad); tot_fields += len(truth); ok_cases += (not bad)
    rows.append((i, "exact" if not bad else "WRONG", bad))
for r in rows: print(r)
print(f"\nfield accuracy {ok_fields}/{tot_fields}; fully-correct policies {ok_cases}/{len(CASES)}")
