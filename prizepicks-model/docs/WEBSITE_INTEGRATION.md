# Website integration plan (The Fantasy Playbook, hosted on Vercel)

Goal: generate the weekly reports from the website repo instead of a chat session, and (optionally) give Sam an
Entry Builder page on the site that does exactly what the spreadsheet does. Decide each "Decision" with Sam before
building - he is not a developer, so explain trade-offs plainly.

## Constraints
- The pipeline is Python (pandas/numpy/openpyxl), downloads ~400 MB of play-by-play, and takes a few minutes.
  That does NOT fit Vercel serverless functions (size and time limits). Keep the pipeline as a batch job.
- The odds API key is a secret: `.env` locally, repository/deployment secrets in CI. Never in client code.
- `ledgers/` (Sam's bets, results) and bankroll are private - never published or sent to the browser.
- Spreadsheet stays a first-class output (Sam uses it in Google Sheets on his phone).

## Recommended architecture
```
repo/
  prizepicks-model/            <- this package (pipeline, harness, docs, ledgers)
  <website app>/               <- existing site (Vercel)
       public/data/prizepicks/<slate-id>/slate.json, sims.json   (or Vercel Blob)
```
1. **Run the pipeline** (Decision A):
   - A1 Local (simplest, start here): Sam (or Claude Code with him) runs `run_slate.py prep` / `build` on his PC.
   - A2 GitHub Actions on a schedule (Thu/Sun/Mon) with `SGO_API_KEY` as a repo secret. Caveat: injuries must be
     confirmed by a person before `build` - so automate `prep` (and an injury-news summary), keep `build` a manual
     "workflow_dispatch" step after Sam confirms outs.
2. **Publish outputs:** `export_web.py` writes `slate.json` (~60 KB per game) and `sims.json` (~300 KB per game,
   ~3-5 MB for a full Sunday; gzip it, or cut to 1,000 sims for the web). Commit to `public/data/...` (triggers a
   Vercel deploy) or upload to Vercel Blob. Also attach the .xlsx for download.
3. **Site pages** (Decision B - public, private, or both):
   - Private "Slate" page for Sam: Entry Builder (port of `docs/ENTRY_MATH_SPEC.md`, computed in the browser from
     sims.json), Best Legs, Player Lines (ladders), Top Entries, Injuries. Behind a simple auth (Vercel password
     protection or an auth library).
   - Optional public content: brand is for casual fantasy players - approachable, not stat-heavy. If any betting
     content goes public, add plain disclaimers (21+, for entertainment, no guarantees) and responsible-gambling
     links; check PrizePicks/affiliate and state rules before monetizing. Recommend private-first.
4. **Grading + ledger** stay in Python (`grade_game.py`, ledgers CSV). A private page can read a sanitized summary.

## Entry Builder port - requirements
- Implement the spec exactly; unit-test against the reference cases in ENTRY_MATH_SPEC.md and against the
  spreadsheet's numbers for random entries (same sims.json rows -> same results to the 0.1%).
- UI: dropdown Player -> Stat (only his stats) -> More/Less -> Line (that stat's ladder + type-in); free-space toggle;
  Power/Flex; multiplier inputs; bankroll. Big PLAY / SKIP / FIX LEGS verdict with the one-line reason, then the key
  numbers, rule checks, and "Show the math". Mobile-first (Sam uses his phone).
- Keep wording plain; never use the words genuine, genuinely, real, honestly.

## Suggested phases
1. Move this package into the repo, set up Python env + `.env`, run the replay smoke test (RUNBOOK). No site changes.
2. Run one live slate end to end from the repo (with Sam confirming injuries). Compare with expectations.
3. Add the publish step (export -> repo/Blob) and a private page that only lists the slate and links the .xlsx.
4. Build the web Entry Builder + Best Legs + Player Lines, tested against the spreadsheet.
5. Optional: scheduled `prep` in GitHub Actions, grading dashboard, public content.

## Things to ask Sam early
- Run locally or in GitHub Actions? Is the repo public or private? (Affects where ledgers/snapshots can live.)
- Private page only, or some public content?
- Which framework is the site (check the repo) and how is it deployed today?
