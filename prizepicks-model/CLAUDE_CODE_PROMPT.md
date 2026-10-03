# Paste everything below this line into Claude Code as your first message
---

I'm bringing my PrizePicks NFL prop model into this website repo (The Fantasy Playbook, hosted on Vercel). It was
built over several long Claude chat sessions, and I want this repo to be where I generate the weekly reports from
now on, and eventually show them on the site. I'm not a developer and I'm still learning the betting math, so
explain things plainly, lead with the answer, and tell me directly if I'm wrong about something.

I've added a folder called `prizepicks-model/` to the repo. It contains the full pipeline code, the parameter
files, saved odds snapshots, my graded-results ledgers, the latest reports, and a docs folder that captures
everything: how the model works, every formula and setting and the test behind it, the weekly process, the exact
Entry Builder math, a website plan, and my preferences/rules.

Please do this, in order:

1. Read `prizepicks-model/CLAUDE.md` and every file in `prizepicks-model/docs/` before changing anything (start with
   CHANGELOG_SINCE_LAST_TRANSFER.md, then RUNBOOK.md, KNOWLEDGE_BASE.md, ENTRY_MATH_SPEC.md, WEBSITE_INTEGRATION.md,
   PREFERENCES.md). Then give me a short summary of what you understand the project to be and where it stands, so I
   can confirm nothing got lost.
2. Look at this repo's current structure and tell me how `prizepicks-model/` should sit in it (keep it as its own
   folder unless there's a good reason not to). Make sure `.env`, raw play-by-play data, pickles, and the
   `ledgers/` folder are git-ignored if the repo is public - check with me.
3. Set up the Python environment (Python 3.10+, `pip install -r prizepicks-model/requirements.txt`), help me create
   `prizepicks-model/.env` from `.env.example` with my SportsGameOdds key (I'll paste the key into the file myself),
   run `python fetch_data.py` from `prizepicks-model/pipeline/`, then run the offline replay smoke test from
   RUNBOOK.md and confirm it reproduces the Week 4 Thursday report (67 legs priced, 619 dropdown lines, best 4-leg
   EV about +17%). If anything differs, stop and explain before fixing.
4. Propose (don't build yet) the website integration based on WEBSITE_INTEGRATION.md, and ask me the questions it
   lists. I'm leaning toward running the pipeline on my PC first and a private page on the site later.

Rules that matter to me (details in the docs):
- Don't change model settings or math without validating the change the way the docs describe and showing me the
  before/after numbers. Every current setting has a test behind it.
- Only confirmed injuries get redistributed. Never change a player's team from memory. Verify any stat before
  stating it. Check for duplicate player names whenever a share file changes.
- The spreadsheet must have zero formula errors and must work in Google Sheets on my phone.
- Never use the words "genuine", "genuinely", "real", or "honestly" in anything you write for me or the site.
- Keep my API key and my betting ledger private.

Where things stand right now: Week 4 Thursday (Steelers at Browns) report is done. Next up: grade Thursday's game
after it's played, run the Week 4 Sunday slate (UTC window 2026-10-04T12 to 2026-10-05T12), then Monday, then check
the pre-registered Week 4 questions in KNOWLEDGE_BASE.md section 10 after Sunday's grading.
