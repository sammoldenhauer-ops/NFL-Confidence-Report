# Weekly Runbook

All commands run from `pipeline/`. Python 3.10+. Times: SportsGameOdds `startsAt` is UTC.

## One-time setup
1. `pip install -r ../requirements.txt`
2. Copy `../.env.example` to `../.env`, set `SGO_API_KEY` (SportsGameOdds key; never commit `.env`).
3. `python fetch_data.py` - nflverse play-by-play 2022-2025 (`pbp_YYYY.csv`), current season (`pbp_latest.csv`),
   `players.csv`. Re-run before every slate so `pbp_latest.csv` has the latest week.
4. Smoke test: `python run_slate.py prep --replay snapshots/sgo_slate_2026-10-01_final.json`, then
   `python run_slate.py build --title "replay test" --out ../reports/_replay.xlsx`. With play-by-play through Wk3
   this reproduces the delivered Wk4 TNF report: 67 legs priced, 619 dropdown lines, best 4-leg EV +17.2%.
   (Once later weeks are in `pbp_latest.csv` the numbers drift slightly - that's expected.)

## Slate schedule (user asks "run Thursday / Sunday / Monday")
| Slate | UTC window for `--start/--end` | Notes |
|---|---|---|
| Thursday | Thu 12:00 -> Fri 12:00 | Final injury designations come out Wednesday afternoon |
| Sunday | Sun 12:00 -> Mon 12:00 | Covers SNF. Inactives ~90 min before each kickoff |
| Monday | Mon 12:00 -> Tue 12:00 | |
Example Week 4 Sunday (Oct 4, 2026): `--start 2026-10-04T12 --end 2026-10-05T12`.
Pull lines twice when possible (day before + game day) - snapshots are saved automatically to `snapshots/`.

## Steps
1. `python fetch_data.py` (current play-by-play).
2. Weekly (first slate of the week): `python refresh_shares.py <last completed week>` - stops if it finds a name
   collision (same player under two spellings on one team). Fix those before continuing.
3. `python run_slate.py prep --start <UTC> --end <UTC>`
   - Prints games, lines by stat, players resolved, QB-specific share adjustments, and AUTO likely-out flags.
   - A "Rate limit exceeded" message after the first page is normal on the free tier; check the game count.
   - Check: every expected game is present; each team has ONE starting QB (if a team shows 2-3 QBs, drop the
     non-starters in apply_outs); players missing lines who are healthy (SGO sometimes lacks a player - e.g. Concepcion).
4. **Injuries** (web search official injury report / inactives). Edit the top of `apply_outs.py`:
   - `DROP_LINES = [(team, player), ...]` - confirmed outs and non-starting QBs (their lines get removed).
   - `OUTS = [{'team','player','recent_share','kind'}]` - share to redistribute, kind 'targets' or 'carries'.
     Teammates' shares are divided by (1 - share). If teammates' weighted shares already include games without the
     player, use a smaller share so the replacement lands near his no-starter usage (Dowdle Wk4: 28% not ~40%,
     putting Warren at 0.807 vs his 0.81 Week 3 share without Dowdle). Check the result.
   - `NOTES = [(team, player, status, note)]` - everything else worth knowing (questionables, healthy-but-flagged,
     defensive/O-line injuries). Shown in the report.
   - ONLY confirmed outs go in DROP_LINES/OUTS. Flags are wrong often.
5. `python run_slate.py build --title "Week N Sunday" --out ../reports/Slate_Report_WkN_SUN.xlsx`
   - Runs apply_outs -> slate_copula (sim x2) -> slate_center -> slate_entries2 -> ladders -> slate_book3.
   - Sanity checks in the output: "legs priced X of X"; "legs dropped (couldn't center)" should be 0 or tiny;
     centering "single legs now" mean ~0.5-0.66 (higher on slates with many TD legs).
6. Verify the report (below) and send it. In the chat summary: favorite/total, outs handled, strongest legs,
   best entries vs the cushion rule, reminders (check PrizePicks lines, type the app multiplier, small stakes,
   inactives timing). Double-check spread direction (`home_exp_margin` < 0 means the AWAY team is favored).

## Verifying a report
- Zero formula errors: recalc with LibreOffice headless (e.g. `soffice --headless --convert-to xlsx` into a temp dir,
  or the xlsx recalc script used in the chat sessions) and scan for `#` errors. Excel/Sheets calculate on open anyway.
- Numbers, not just "no errors": fill the Entry Builder with a few test entries (code in openpyxl), recalc, and compare
  leg chances / all-hit / EV against Python on the same Sims rows. Scenarios used before: a promo free-space entry,
  a QB + 3 receivers stack (expects x0.90), a rule-break entry (expects FIX LEGS), a Flex entry.
- Grep visible text for banned words: genuine, genuinely, real, honestly.
- Dropdowns: per-leg helper lists on the Lists sheet (cols T-Y stats, AB-AG lines). Check that a player's Stat list
  shows only his stats and the Line list shows only that stat's ladder (e.g. receptions 0.5-7.5, pass yds 112.5-312.5).

## After games: grading (BEFORE running the next slate)
1. `python fetch_data.py` (or just re-download the current season) so `pbp_latest.csv` includes the games.
2. `python grade_game.py <week> <game_id,...>` (nflverse game ids like `2026_04_PIT_CLE`) -> `slate_graded.pkl`;
   prints range coverage (middle 50% / 80%, tails, median landing spot) for the market-centered and raw model, and the
   More hit rate vs predicted at the market line, by stat. The raw-model disagreement check (legs where the raw model
   and the market differ by 15+ points: did the raw side win?) is computed ad hoc from `slate_legs.pkl` (raw p_more)
   vs `slate_graded.pkl` - worth adding to grade_game.py.
3. Append to `ledgers/Slate_Results_Ledger.csv` (add `model_version`). Log Sam's entries in `ledgers/Entry_Ledger.csv`
   (one row per pick: PrizePicks line, actual, payout, result; note when the PP line differed from the book line).
4. Compare against the pre-registered checks in KNOWLEDGE_BASE "Open questions". Don't tune mid-week.

## Common gotchas
- SGO rate limit on later pages: normal. SGO can lack a player's props entirely.
- SGO `touchdowns` over/under odds are inconsistent; the board uses the yes/no market. Rushing/receiving TD markets are
  one-sided - not used.
- nflverse `spread_line` = expected HOME margin (positive = home favored). SGO-derived `home_exp_margin` likewise.
- PrizePicks lines can differ from book lines (Hurts Rush 26.5 vs 24.5 cost two legs). The Entry Builder takes the
  PrizePicks line.
- The sim keeps one QB row per team - more than one QB with pass lines on a team = wrong QB. Drop backups.
- Players who changed teams: shares only count games with the current team.
