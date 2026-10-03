# NFL PrizePicks Confidence Tool - Handoff (as of Thu Oct 1, 2026 - model v6.4, report v7)

## Setup in a new chat
1. Unzip into a working folder (e.g. /home/claude/work) and `cd` into `scripts/`.
2. `bash fetch_data.sh` (downloads play-by-play 2022-2026 + player IDs from nflverse, ~5 min).
3. Everything else (settings, outcome pools, shares) is already in `scripts/`.

## Weekly workflow (user sends "run Thursday / run Sunday / run Monday")
Run in order from `scripts/`:
1. `python3 pull_lines.py <UTC start> <UTC end>` - SportsGameOdds consensus lines (9 books) for that window.
   Sunday window: Sun 12:00 UTC to Mon 12:00 UTC (covers Sunday night). Free tier: ~10-12 calls per pull is fine.
2. `python3 slate_board.py` - game lines + every player prop line.
3. `python3 slate_inputs.py` - shares, volumes, efficiency, QB-specific shares, likely-out flags.
   **Check the likely-out list against official inactives (web search) before step 4** - see Known Issues.
2b. Weekly: `python3 refresh_shares.py <last completed week>` - refreshes the blended share file (keeps the
   original weighting: 2026 weight = games/(games+2.33) targets, games/(games+1.86) carries; adds new players;
   stops on name collisions).
3a. `python3 td_params.py` - TD parameters from pbp (TDs per team point, team pass-TD share, red-zone target and
   goal-line carry multipliers). Pass a game_id to exclude it when re-running a past slate.
3b. `python3 apply_outs.py` - edit DROP_LINES / OUTS at the top first. Drops lines for confirmed-out players and
   non-starting QBs (the sim keeps only ONE QB row per team - with 3 QBs on the board it picks the wrong one),
   and redistributes only confirmed-out shares.
4. `python3 slate_copula.py` (runs slate_sim.py twice - see v6.2 below; do NOT run slate_sim.py alone) - v5 game-script simulation, 5,000 games per matchup. Check the balance printout:
   model should pick More on roughly 40-60% of legs per stat; a one-sided result means a bug.
5. `python3 slate_center.py` - v6: scales each range so P(over the BOOK line) equals the market's no-vig
   probability at that line (from book over/under odds). Keeps correlations.
6. `python3 slate_entries2.py` - Top Entries (2-6 legs), lines within 40-60% of the market midpoint only.

8. Recalc: `python3 /mnt/skills/public/xlsx/scripts/recalc.py /mnt/user-data/outputs/Slate_Report.xlsx 250`

   (expect ~14,000 formulas, 0 errors). Rename the file by week (use nflverse week numbering).
9. After games: download play_by_play_2026.csv.gz (gzipped - gunzip it) to `pbp_wk4.csv`, then
   `python3 grade_game.py <week> <game_id,...>` (e.g. `3 2026_03_PHI_CHI`); append to Slate_Results_Ledger.csv.
   Log the user's actual entries in `ledgers/Entry_Ledger.csv` (PrizePicks line, actual, payout, result).
   IMPORTANT: re-running steps 1-6 overwrites the pickles grade_game.py reads - grade BEFORE running the next slate.

## Report tabs (user-approved layout)
How To Use | By Player (full ladder per stat, filter by player) | By Stat & Confidence (filter stat + bucket,
only lines within 2 steps of market) | Player Summary (sweet spots: More 60/70/80%+ up to X) | Top Entries |
Combo Builder (COUNTIFS over Sims tab, user types PrizePicks line) | Likely Out | Payouts (editable) | Assumptions.
Steps: 10 pass yds, 5 rush/rec yds (2 if line < 25), 1 receptions/TDs. User bets on PrizePicks (2-6 leg entries).

## Methodology and why (all validated out of sample unless noted)
- Event-by-event simulation (targets/carries/attempts x per-event yards from historical pools) beat normal curves
  (2025 held-out calibration gap 61 -> 21 receiving, 56 -> 27 rushing).
- v5 game-script layer: margin ~ spread + N(0, 12.4); team volumes shift with margin; lead-back share drops ~4 pts
  in blowouts. Same-game QB + top WR combos: error cut roughly in half vs independent sims (2024 and 2025).
- Market centering: across 626 graded props, market lines beat our projections for every stat, so ranges are
  centered on the market; the model supplies shape and correlation.
- v6 CENTERING FIX (Sep 29): v5 treated SGO's fairOverUnder as a 50/50 median, but SGO pairs it with its own
  fairOdds (e.g. Hurts fair 224.5 was only 42% over; the 218.5 book line was 50/50). Every center sat too high:
  v5 said More 53.6% at market lines vs 51.1% actual (640 props); its 57%+ leans hit 53% (predicted 64%),
  worst on Receptions (66% vs 50%) and Rush Yds. v6 matches the book line's no-vig probability (avg gap 0.5 pts).
  The old "3-pt haircut" was mostly this bug; calculator default lowered to 1 pt pending Week 4.
  PrizePicks payouts are dynamic per entry (and promos change them): always use the app's To Win multiplier.
- Shares: computed from play-by-play, NOT the blended share file: EWM (halflife 6 games, back into 2025, current
  team only) of game shares. The blended file (30% Wk1 / 70% preseason targets, 35/65 carries, frozen after Wk1) is
  only the fallback for players with <2 games (1 game -> 50/50 with blended; 0 -> blended). v5 looked it up but
  discarded it (fixed Sep 29). Wk3 test, avg miss in share pts: targets EWM 5.97 vs blended 6.23 vs 50/50 5.93
  (n=178); carries 12.08 vs 12.91 vs 11.86 (n=74). Since market centering, shares drive the raw model, range
  shape, teammate correlation and out-redistribution, not the line itself. Share file de-duplicated Sep 29
  (Mike Washington Jr. LV, Ted Hurst III TB) - run the name-collision check whenever the file changes.
- Share details: QB-specific receiver shares when the starter differs from recent games,
  using only games the receiver was active; team caps: named receivers <= 88% of targets, named rushers <= 90% carries.
- Tested and rejected: team pass-defense adjustments, shared QB/WR efficiency factor, skew-normal, full play-by-play
  engine (research track: best on rushing, behind elsewhere).

## Sunday Sep 27 grading (first live test, 598 player-stats)
- Market line: More hit 51.3% vs 53.5% predicted (good).
- Ranges too wide: 64% in middle 50% (target 50), 90% in middle 80% (target 80). Hold 2-3 weeks before refitting.
- Near-market ladder rungs ~3 pts optimistic in 60-89% buckets; far rungs 3-5 pts too cautious.
- Top Entries: 75% of legs hit; heavily overlapping legs, so treat as a few outcomes.
- Raw model's side won 54.3% where it disagreed with the line by 15%+ (n=387). Track weekly; if it holds,
  blend part of the model back in instead of full market centering.

## Report v7 (Oct 1) - scripts/slate_book3.py "<title>" <output.xlsx>  (replaces slate_book2.py + add_calculator.py)
Run it after ladders.py, then recalc.py (~14,300 formulas, expect 0 errors). Tabs: Start Here | Entry Builder |
Top Entries | Best Legs | Player Lines | Injuries & Notes | Learn the Math | Settings; hidden Sims, Lists, Calc.
- Entry Builder: dependent dropdowns (Player -> Stat -> More/Less -> Line from that ladder, custom line allowed) built
  from per-leg helper lists on Lists (cols T-Y stats, AB-AG lines) - plain ranges, so they work in Google Sheets too,
  Free space? column (promo leg = 99%), Power/Flex, app multiplier(s), bankroll. Verdict PLAY / SKIP / FIX LEGS
  (rule breaks: same player twice, one team, TD Less). Applies stack corrections (x0.95/x0.90 same-side QB +
  receivers, x0.90 QB Pass TDs More + receiver TD More), safety cut, cushion (Settings), quarter-Kelly stake
  ($0 unless PLAY), and a "Show the math" block. Verified cell-by-cell against Python on the same sims.
- apply_outs.py now also takes NOTES (team, player, status, note) -> shown on Start Here and Injuries & Notes.
- Pre-fills the best 4-leg entry as an example (multiplier left blank so the user types the app's).

## Wk4 TNF run (Oct 1, PIT @ CLE): outs = Dowdle only (28% carries - calibrated so Warren ~0.81, his no-Dowdle Wk3
share - and 9.5% targets). Auto-flag on KC Concepcion (CLE) was FALSE - healthy, just missing from the odds feed.
Odds snapshots: scripts/sgo_slate_2026-10-01_wed.json and _final.json.

## v6.4 range width (Sep 30)
- Re-ran the current model on Week 3 Sunday's actual book lines (598 props, 14 games) using only pre-game data
  (pbp through Wk2 + TNF, flags off, book_p_over=0.5 at the half-point line). v5 had 64% of results in the
  middle 50% / 90% in the middle 80%; v6.3 had 54.5% / 83.6% - the centering fix removed most of the
  "too wide" problem. Receptions were on target (50/83); yardage stats still slightly wide (~55/83).
- Fix: yardage ranges (Pass/Rec/Rush/Rush+Rec Yds) narrowed 5% around the BOOK line in slate_center.py
  (WIDTH_YDS=0.95; keeps the line's % unchanged). Leave-one-game-out: best factor 0.90-1.00 every time,
  held-out calibration gap 1.84 -> 1.48 pts. After: 51.5% / 78.9% on all 598 props (target 50/80).
- Historical proxy-line check (harness_tools/width.py) was inconclusive because proxy lines are less accurate
  than market lines by different amounts per stat (pass yds 0.32 vs 0.21 relative miss).
- Model's own TD rates (harness_tools/td_check.py, 2,060 player-games): ranks scorers better than own-prior or
  role-average baselines, but level is ~20% low (25.0% vs 31.2%) even though team TD totals (2.40 vs 2.47) and
  named-player share (69.5% vs 70.1%) are right - actual TDs spread across players more than the sim does.
  A spread-out factor (TD_REPEAT in slate_sim.py) fixes the rate but breaks validated TD pair lifts
  (RB1+RB2 0.90 -> 1.24 vs actual 0.91), so it's OFF (1.0). No impact on reports: every TD prop is centered
  on the books' price; the raw rate only shapes correlations.

## v6.3 correlation tuning on history (Sep 30) - harness_tools/
v6.2's settings were tuned by comparing only Monday's 2 teams (PHI, CHI) to league history. v6.3 re-tunes on
206 games / 412 team-games from 2024-25 weeks 6-18 (each with QB, top-3 receivers, top-2 RBs by prior usage).
- harness_tools/build.py builds a synthetic slate from pre-game info only (prior-game usage, team volumes, Vegas
  spread/total); evaluate.py sets matchup-adjusted usual-level lines (prior mean x fitted total/spread effect, so
  they behave like market lines) and bootstrap 80% ranges; tune.py fits on half the games, tests on the other.
  Run from a copy dir (build.py copies slate_sim.py + params from scripts/). SIM_N / SIM_SEED env vars.
- Matchup-adjusted actual lifts are LOWER than the earlier ceiling: QB+WR1 1.23, QB+WR1+WR2 1.33, QB+top3 1.34,
  WR1+WR2 0.97, QB+own RB1 0.96, QB+opp QB 1.07, QB+WR1+opp QB 1.35, RB1+RB2 rush 1.04, RB1 TD+RB2 TD 0.91,
  RB1 TD+WR1 TD 1.05, QB 2+ pass TDs+WR1 TD 1.53, WR1 yds+WR1 TD 1.32.
- Held-out half error (noise-scaled): no tuning 5.96, tuned settings 1.35-2.69. Halves disagree on exact values
  (receiver split 0.6 vs 1.0) so values are approximate; GL_SD 1.0 beat 2.0 in every pairing.
- v6.3 defaults: SH_SD 0.6, TOT_SD 6, EFF_B 0.6, CS_SD 0.5, PF_K 20, GL_SD 1.0. All-games fit: every combo inside
  its 80% range except QB 2+ pass TDs + his WR1 TD (sim 1.70 vs 1.53, overrated ~10%). QB+top3 (1.49 vs 1.34)
  sits at the top of its range. Same-team RB TD pairs now fine (0.90 vs 0.91).
- Monday best-entry EVs (default payouts): 4-leg +53% (v6.1) -> +37% (v6.2) -> +36% (v6.3); 6-leg +196 -> +119 -> +130.
- Re-run mid-season with 2026 games added (build.py reads pbp_2024/2025).
- Combo corrections in slate_entries2.py (column combo_corr): QB Pass Yds + 2 same-team receiving legs on the SAME side
  (all More or all Less) x0.95, + 3 or more x0.90 (unders assumed symmetric to the measured overs); QB Pass TDs More + same-team Anytime TD More x0.90. Combo Builder in the workbook does NOT
  apply them - knock 5-10% off those stacks by hand there.

## v6.2 stack correlations (Sep 30, values superseded by v6.3) - stack_test.py measures actual 2024-25 lifts
Lift = how much more often legs hit together than if unrelated. Pre-game "usual level" lines (prior-game means)
don't know the matchup, so actual lifts here are a ceiling for market-line lifts.
| combo | v6.1 sim | v6.2 sim | actual |  QB+WR1 1.33-1.42 / 1.34 / 1.32 | QB+WR1+WR2 1.75-1.81 / 1.56 / 1.52 |
QB+top3 2.22-2.25 / 1.81 / 1.85 | WR1+WR2 1.06-1.08 / 1.01 / 0.95 | QB+own RB1 0.97 / 1.02 / 0.96 |
QB+opp QB 0.97 / 1.12 / 1.12 | QB+WR1+opp QB 1.28-1.37 / 1.51 / 1.59
TD pairs (pre-game roles): RB1+RB2 both score 1.09 / 1.00 / 0.83 (STILL TOO HIGH - avoid) | RB1+WR1 1.02-1.12 /
1.08 / 0.95 | QB 2+ pass TDs & WR1 TD 1.44 / 1.51 / 1.59 | WR1 yds & his TD 1.39-1.61 / 1.51 / 1.36 |
RB1+RB2 rush yds - / 0.97 / 1.02.
Settings (slate_sim.py env defaults): SH_SD=0.6 receiver share competition; TOT_SD=10 shared game-scoring swing
with EFF_B=0.6 efficiency link (shootouts); CS_SD=0.5 carry competition; PF_K=20 game-level pass/rush TD lean;
GL_SD=2.0 goal-line role lean. These widened ranges ~20%, so slate_copula.py keeps each player's range from a
run without them and takes only the joint behaviour (rank order) from the tuned run.
Effect on Monday Top Entries (default payouts): best 4-leg EV +53% -> +37%, 5-leg +116% -> +78%, 6-leg +196% -> +119%.
Tuned on 2 teams' structures (Monday slate) vs league-wide history - re-check on Week 4's full slate.
Share file refresh test (blend thru Wk2 -> Wk3): targets model 5.98 vs blend 6.17 vs 50/50 5.99; carries model
12.61 vs blend 11.50 vs 50/50 11.57 (blend better for carries). Pre-registered: switch carries to blend if it
wins again in Week 4.

## Anytime TDs (v6.1, Sep 29)
- Line: SGO 'touchdowns' yes/no market (FanDuel/Caesars/DraftKings/BetMGM), margin removed -> 'Anytime TDs' 0.5.
  The one-sided rushing_/receiving_touchdowns markets are NOT used (no books listed, inconsistent: Smith rec TD
  priced shorter than his anytime TD).
- Sim: team TDs ~ Poisson(implied team points x 0.106 TDs/pt), split pass/rush by team pass-TD share (shrunk to
  league 62%). Receiving TDs handed out by sim receiving yards x red-zone multiplier; rushing TDs by sim carries x
  goal-line multiplier (inside the 5). QB Pass TDs = team receiving TDs (was an independent Poisson in v6).
- Centering: thin or boost each player's TDs to match the market's no-vig chance (scaling can't create TDs).
- Tests: zone multipliers beat plain volume share, held-out 2025 wks 12-18 log loss 0.3989 vs 0.4020 (shrink
  k=80 targets, k=8 carries). Correlations vs 2024-25 actuals (1,048 team-games): QB 2+ pass TDs & top WR TD
  sim 1.51 vs actual 1.53; top WR big yards & his TD 1.33-1.45 vs 1.35; lead RB TD & top WR TD 1.01-1.06 vs 0.94
  (still slightly high). Same-team RB pairs (e.g. Swift+Monangai 1.08) are untested and probably too high -
  avoid stacking two same-team RB TDs. Monday: 4 scorers vs 4.06 expected by the market.
- Entries: TD legs More-only. PrizePicks TD props are usually demons with their own payout - price them in the
  Entry Calculator with the app's To Win multiplier; Top Entries' default payouts don't apply.

## Monday Sep 28 grading (PHI @ CHI, 42 props, 1 game - treat as a small sample)
- Outs: all 4 handled from confirmed news (Williams, Goedert, H. Brown out; Bagent backup) - 0 errors.
- Ranges: 71% in middle 50%, 93% in middle 80% (still too wide). More hit 47.6% vs 54.3% predicted (v5).
- Raw model vs market (15%+ disagreement): raw side 3 of 7 (Sunday 54.3%, n=387). Keenum 247 vs 169.5 line
  (raw 226) was the one big raw win. No blend yet.
- User entries: 5 x $1 Power, 1 win, returned $6.25 (+$1.25). Picks 8-7. Hurts Rush 26.5 on PrizePicks vs 24.5
  at books missed by 1.5 twice - check PP line vs report line.

## History (confidence vs actual hit rate, stated lines)
- Wk1 old model: +4.9 pts overconfident (1,087 lines). Wk2: +3.9 (1,386). Thu Sep 24 v4 ranges: 55%/79%.
- Wk3 Sun v5: near-market ~+3 (centering bug), far lines 3-5 pts too cautious. Mon v5: cautious (1 game).

## Pre-registered checks for Week 4 (decide after Sunday grading, don't tune mid-week)
1. v6 centering: More rate at the market line should be within ~2 pts of predicted. If yes, set haircut to 0.
2. Range width: re-test AFTER v6 (v5 too-wide/upper-tail signal was partly the high centers). Held-out test on
   v5 PITs: trimming the upper half (x0.77 yardage, x0.82 counts) halved the calibration gap. Apply only if the
   Week 4 v6 PITs still show outcomes landing above the 75th pct < 20% of the time.
3. Raw-model blend: keep tracking the 15%+ disagreement win rate (needs 2+ weeks above 53%).
4. Shares: re-run the EWM vs blended vs 50/50 test on Week 4. Switch to 50/50 only if it wins 2 weeks running
   (would also need the blended file refreshed weekly).
5. Anytime TDs + Pass TDs: grade calibration (should match market) and same-team TD pairs from Week 4 onward.
6. SGO odds are only available pre-game: save sgo_slate.json per slate (copy to sgo_slate_<date>.json) so grading
   can test centering choices later.

## Known issues / next steps
1. Likely-out flags (recent role, no line) were wrong 5 of 11 times. Use official inactives/injury news at run time;
   only redistribute confirmed outs; flag the rest for the user.
2. Refit range width after 2-3 more graded weeks.
3. Entry ledger started (ledgers/Entry_Ledger.csv).
4. Top Entries reuse many of the same legs; consider limiting how often one leg appears.

## User preferences to respect
Never use the words "genuine", "genuinely", "real", or "honestly". Lead with answers, keep it concise (mobile).
Verify any stat claim against data before stating it. Never change a player's team from memory; trust the data/user.
