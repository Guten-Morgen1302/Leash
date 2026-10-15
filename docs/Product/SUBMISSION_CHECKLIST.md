# Submission checklist (from the official Rules, read first-hand; deadline Nov 12, 2026, 12:00 pm PT = 20:00 UTC)

Target submit: Nov 9. Do not wait for the last day: the Rules freeze edits after the deadline.

## Required by the Rules
- [ ] Project meaningfully integrates PayPal (sandbox) and AI (Stage One is pass/fail on this)
- [ ] Text description of features and functionality (docs/Product/DEVPOST_SUBMISSION.md, trimmed to the true shipped build)
- [ ] Working demo: run instructions in the repo OR a hosted URL (hosting is optional); a mockup or static page does not count
- [ ] Public repo (GitHub/GitLab/Bitbucket) with ALL source, assets and instructions
- [ ] Open source license file detectable and shown in the repo's About section (MIT)
- [ ] Demo video: under 3:00, public on YouTube, shows the project on the device it was built for
- [ ] Video has no third-party trademarks and no copyrighted music
- [ ] Tools used are listed with how they were used (PayPal sandbox, Claude Code, PayPal AI Toolkit, Gemini, AG Grid, etc.)
- [ ] All materials in English
- [ ] Project is available free of charge through the end of judging (Dec 15, 2026, 8:00 am PT); hosted demo, if any, stays up until then
- [ ] Any keys judges need are in the README, and a no-keys path exists (sim mode)

## Quality gates (ours)
- [ ] `npm run doctor` passes on a clean machine
- [ ] Fresh-clone dry run on a clean Windows profile; time recorded in docs/TTHW.md
- [ ] Test suite green on both SQLite drivers (or the node:sqlite claim removed from the text)
- [ ] Secret scan over full git history (no `.env`, tokens, card numbers, `.seed/`)
- [ ] AG Grid browser console shows no license warning
- [ ] Banned words absent from all copy: tamper-proof, non-repudiation, mathematically, proves, perfect
- [ ] Every claim in docs/Product/DEVPOST_SUBMISSION.md matches the evidence table at its end
- [ ] Someone who has not seen the project can say what it does from the video alone
- [ ] Video rough cut by Oct 31; final by Nov 8
- [ ] Devpost "significantly updated" note not needed (new project); state it is new
- [ ] Entry is solely our work; no PR to PayPal's repos before the deadline

## After submission
- [ ] Offer the hook to PayPal's AI-Toolkit repo as an issue or PR
