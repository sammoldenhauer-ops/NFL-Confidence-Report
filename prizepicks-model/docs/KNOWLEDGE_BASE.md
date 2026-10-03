# Knowledge Base - how the model works (v6.4 model, v7 report, Oct 1 2026)

## 1. The idea in one paragraph
Sportsbook lines are the best single estimate of each player's center - across 626 graded props the market beat our
own projections for every stat type. So the model does NOT try to beat the line on its own. It (a) takes each
player's chance at the book line from the market (odds with the margin removed), (b) uses a simulation to supply
the SHAPE of each player's outcome range (so we can price any other line - ladders, PrizePicks lines that differ,
goblins/demons) and (c) supplies how legs move together (same-game stacks), which PrizePicks payouts don't price.
The edge comes from: books leaning one way at PrizePicks' flat line, PrizePicks lines differing from books, and
correlated stacks.

## 2. Data
- Lines: SportsGameOdds API v2 (`/v2/events?leagueID=NFL&oddsAvailable=true`), consensus of ~9 books.
  Player over/under props per stat: `bookOverUnder`, `bookOdds` (+ opposing side via `opposingOddID`), `fairOverUnder`,
  `fairOdds`. Game lines give `home_exp_margin` (negative = away favored) and total.
  Anytime TD: `statID='touchdowns'`, `betTypeID='yn'`, side 'yes'/'no' (FanDuel, Caesars, DraftKings, BetMGM).
  Odds vanish after kickoff - every pull is snapshotted.
- Play-by-play: nflverse `play_by_play_YYYY.csv.gz` 2022-2025 + current season; `players.csv` for ids/names/positions.
- Stats priced: Pass Yds, Pass TDs, Rush Yds, Rec Yds, Receptions, Rush+Rec Yds, Anytime TDs.

## 3. Pipeline (pipeline/, in order)
| Step | Script | Output |
|---|---|---|
| Pull lines | `pull_lines.py <UTC start> <UTC end>` | `sgo_slate.json` + `snapshots/` copy |
| Board | `slate_board.py` | `board.pkl` (player, team, stat, line, fair, fair_p_over, book_p_over), `slate_games.pkl` |
| Inputs | `slate_inputs.py` | `slate_inputs.pkl` (shares, volumes, flags), `slate_eff.pkl` (efficiency tables) |
| TD params | `td_params.py [exclude_game_ids]` | `td_params.pkl` |
| Outs | `apply_outs.py` (edit config first) | edits board + inputs; `flags` (confirmed outs) + `notes` |
| Simulate | `slate_copula.py` (runs `slate_sim.py` twice) | `slate_sims.pkl`, `slate_legs.pkl`, `slate_td_intensity.pkl` |
| Center | `slate_center.py` | `slate_sims_centered.pkl`, `slate_legs_centered.pkl` |
| Entries | `slate_entries2.py` | `slate_entries.pkl`, `slate_legs_final.pkl` |
| Ladders | `ladders.py` | `ladder_rows.pkl`, `ladder_summary.pkl` |
| Report | `slate_book3.py "<title>" <out.xlsx>` | the workbook |
| Grade | `grade_game.py <week> <game_ids>` | `slate_graded.pkl` + printed calibration |

## 4. Simulation (slate_sim.py) - per game, N = 5,000 simulated games
- **Game script:** home margin = spread + Normal(0, 12.4). Shared scoring environment tot = total + Normal(0, TOT_SD=6).
- **Team volume** (targets, attempts, carries): base team volume (recent average) + coefficients
  (`gamescript_coefs.json`: intercept, expected margin, margin shock = sim margin - expected, total) + Normal residual.
  E.g. carries rise +0.26 per point of margin shock (leading teams run); targets fall -0.16.
- **Shares** (from `slate_inputs.py`): EWM of each player's game share, half-life 6 games, history back into 2025,
  only games with his current team. Fallback for <2 games: blended share file (1 game -> 50/50 with blended,
  0 games -> blended). QB-specific receiver shares when the starter differs from recent games. Caps: named receivers
  <= 88% of team targets, named non-QB rushers <= 90% of carries. Game-script share shifts for lead/secondary/depth
  backs by margin bin (`share_shift.json`, e.g. lead back -3.9 pts in 17+ point games either way).
- **Per-sim share noise (correlation):** receivers' shares multiplied by lognormal(SH_SD=0.6) then renormalized so the
  named total is unchanged -> receivers compete (one's big day takes from teammates). Same for carries (CS_SD=0.5).
- **Player volume:** negative binomial around share x team volume (dispersion DR=1.12 targets, DU=1.87 carries).
- **Yards:** event-by-event. Each target draws yards from a historical per-target pool by depth tier (short/mid/deep
  by player's aDOT: <=6 / <=9 / >9), scaled by player yards-per-target (shrunk: (yds + 120 x league)/(tg + 120);
  league WR 8.3, TE 7.1, RB 5.9). Carries draw from the historical per-carry pool scaled by yards-per-carry.
  Catch rate shrunk with k=120 to position league rates (WR .63, TE .71, RB .78). All yardage x efficiency
  eff = max(1 + EFF_B x (tot - total)/total, 0.3), EFF_B = 0.6 (shootouts lift everyone).
- **QB pass yards** = sum of named receivers' receiving yards + depth targets' yards (team-consistent by construction).
- **Touchdowns (v6.1):** team TDs ~ Poisson(team points x 0.1059) where team points = (tot +/- margin)/2.
  Pass share pf per team (shrunk with 20 pseudo-TDs to league 0.622), drawn per sim from Beta(pf x 20, (1-pf) x 20)
  (PF_K=20: some games lean pass, some run). Receiving TDs handed out with weight = sim receiving yards / ypt x
  red-zone multiplier; rushing TDs weight = sim carries x goal-line multiplier x lognormal(GL_SD=1.0) (game-level
  goal-line role). Multipliers: zone share / volume share, shrunk (k=80 targets inside the 20, k=8 carries inside
  the 5), clipped 0.25-4. QB Pass TDs = team receiving TDs. QB anytime TD = his rushing TDs.
  TD_REPEAT (spread TDs across players) exists but is OFF (1.0) - it fixes the raw rate but breaks pair links.
- **Two-run combine (slate_copula.py):** the correlation settings widen individual ranges ~20%. So each player's own
  values come from a run with SH_SD=TOT_SD=EFF_B=CS_SD=0, re-ordered by rank to follow the tuned run's joint
  behaviour (random tie-breaks). TD stats and Pass TDs keep the tuned run as-is (centering sets their level).

## 5. Centering on the market (slate_center.py)
- Target: P(sim > book line) = book no-vig P(over) at that line. No-vig: American odds -> p (100/(a+100) if a>0,
  -a/(-a+100) if a<0), p_over / (p_over + p_under). Fallback when odds missing: fair line as 50/50.
- Yardage/continuous: find k (bisection, 40 steps) so P(k x sim > line) = target. Counts (Receptions, Pass TDs):
  floor(k x sim + U), U uniform, same target.
- Yardage width (v6.4): after centering, x' = line + 0.95 x (x - line) for Pass/Rec/Rush/Rush+Rec Yds
  (`WIDTH_YDS`), which keeps the line's % unchanged.
- Anytime TDs: scaling can't create TDs, so: if the sim's P(>=1) is too high, each TD survives with prob (1-q)
  (q solved); if too low, add Poisson(c x that sim's TD intensity) (c solved). Keeps the link to team scoring.

## 6. Entries (slate_entries2.py)
- Candidate legs: market-line legs where 0.40 <= P(More) <= 0.60 and the chosen side >= 0.45 (near the midpoint -
  no lopsided lines). TD legs More only. Drops legs whose centering failed (|P(sim > line) - target| > 0.08).
- Search: one leg per player, at least 2 teams; joint probability from the sims (all legs hit in the same simulated
  game); greedy/beam expansion from the best pairs; ranks by joint probability; top 10 per size 2-6.
- Combo corrections (model still slightly overrates these stacks): QB Pass Yds + 2 same-team receiving legs on the
  same side x0.95, + 3 or more x0.90; QB Pass TDs More + same-team Anytime TD More x0.90.
- Standard payouts (fallback only): Power 2:3x 3:5x 4:10x 5:20x 6:37.5x; Flex 3: 2.25/1.25, 4: 5/1.5,
  5: 10/2/0.4, 6: 25/2/0.4. PrizePicks changes payouts per entry - use the app's number.

## 7. Report v7 (slate_book3.py) - see ENTRY_MATH_SPEC.md for the Entry Builder math
Tabs: Start Here (slate, injuries at a glance, 4 steps, tab links, color key) | Entry Builder | Payout Finder (top 10
entries per size ranked by all-hit after corrections + safety cut; 'PLAY at' = (1 + cushion) / all-hit; grid of EV at
multipliers 2-leg 2.00-4.00 / 3-leg 3.50-7.00 / 4-leg 6.00-12.00 every 0.25x, 5-leg 12-25 every 0.5x, 6-leg 20-45
every 1x; green >= cushion, amber positive, red <= 0. Within a size the ranking never changes with the multiplier,
only which entries clear the bar) | Top Entries (one row
per entry, clears-cushion check) | Best Legs (within 2 steps of book line, TD Less excluded, sorted by confidence) |
Player Lines (full ladder) | Injuries & Notes (handled outs, other news, about the model) | Learn the Math (formulas,
EV cheat sheet 50-62% x 2-6 legs Power/Flex, break-even per leg) | Settings (safety cut 1%, cushion 5%/leg, Kelly
0.25, standard payouts). Hidden: Sims (2,000 sims x every player-stat, rounded ints), Lists (dropdown sources incl.
per-leg helper lists T-Y / AB-AG), Calc (per-sim hit flags for the 6 legs + misses count).
Ladder steps: 10 pass yds, 5 rush/rec yds (2 if line < 25), 1 receptions/TDs. Colors: yellow = input, green good,
red bad. Fonts Arial. Must work in Google Sheets.

## 8. Validation record (what each setting rests on)
- Event-by-event sim vs normal curves: 2025 held-out calibration gap 61 -> 21 receiving, 56 -> 27 rushing.
- Game-script layer: same-game QB + top WR combo error roughly halved vs independent sims (2024 and 2025).
- Market centering: market beat projections for every stat (626 props).
- v6 centering fix: v5 More 53.6% predicted vs 51.1% actual at market lines (640 props); fix matches market within 0.5 pt.
- Ranges after v6 + width 0.95 on Wk3 Sunday book lines (598 props): 51.5% in middle 50%, 78.9% in middle 80%.
- Shares: EWM vs blended vs 50/50 Wk3 avg miss - targets 5.97 / 6.23 / 5.93 (frozen file), carries 12.08 / 12.91 /
  11.86; with refreshed blend: targets 5.98 / 6.17 / 5.99, carries 12.61 / 11.50 / 11.57.
- TD allocation: red-zone/goal-line weights beat plain volume (held-out 2025 wks 12-18 log loss 0.3989 vs 0.4020).
  Model ranks scorers better than own-prior or role-average baselines (log loss 0.6046 vs 0.6064 vs 0.6092), raw level
  25.0% vs 31.2% actual (team TD totals 2.40 vs 2.47 right; named-player share 69.5% vs 70.1% right).
- Correlations (harness, 412 team-games, matchup-adjusted lines; lift = P(all) / product of each leg's own rate):
  | Combo | Sim v6.3 | Actual (80% range) |
  |---|---|---|
  | QB + WR1 | 1.25 | 1.23 (1.18-1.28) |
  | QB + WR1 + WR2 | 1.40 | 1.33 (1.22-1.44) |
  | QB + top 3 receivers | 1.49 | 1.34 (1.17-1.53) |
  | WR1 + WR2 | 0.96 | 0.97 |
  | QB + own RB1 rush | ~1.0 | 0.96 |
  | QB + opposing QB | 1.02 | 1.07 |
  | QB + WR1 + opposing QB | ~1.4 | 1.35 |
  | RB1 + RB2 rush yds | ~1.0 | 1.04 |
  | RB1 TD + RB2 TD | 0.90 | 0.91 |
  | RB1 TD + WR1 TD | ~1.1 | 1.05 |
  | QB 2+ pass TDs + WR1 TD | 1.70 | 1.53 (1.44-1.63) - overrated, corrected x0.90 |
  | WR1 yds over + WR1 TD | 1.36 | 1.32 |
  Held-out half error: no tuning 5.96 vs tuned 1.35-2.69. Halves disagreed on exact receiver-split value (0.6 vs 1.0).
- Calibration history: Wk1 old model +4.9 pts overconfident; Wk2 +3.9; Wk3 v5 near-market +3 (centering bug).
- Tested and rejected earlier: team pass-defense adjustments, shared QB/WR efficiency factor, skew-normal,
  full play-by-play engine (research track).

## 9. Betting math the report uses (and Sam is learning)
- Entry hit chance = product of legs if unrelated; same-game legs use the simulated joint chance.
- Break-even = 1 / payout. Per-leg break-even (Power, standard payouts): 2-leg 57.7%, 3-leg 58.5%, 4-leg 56.2%,
  5-leg 54.9%, 6-leg 54.7%.
- EV = chance x payout - 1 = chance / break-even - 1. Mental estimate: legs x (leg% - BE%) / BE%.
- Cushion rule: bet only if EV >= 5% per live leg (estimates can be a couple points off per leg, compounding).
- Stake: quarter-Kelly, bankroll x 0.25 x EV / (payout - 1). Overlapping entries count as one bet - cap the total.
- Promo free space ("Guarantee Pick"): PrizePicks prices it in (a 4-pick paid 5.25x, about a 3-pick rate). Its value
  is only the payout gap vs the same live legs without it. Best free space: most certain stat (QB pass yds > RB
  rush+rec), a player you wouldn't otherwise use (one pick per player), and it can cover the 2-team rule.
- Power vs Flex: Flex pays partial wins by cutting the top prize; correlated legs tend to all hit or all miss, which
  favors Power. At 5-6 legs Flex can be worth it for smoother results.
- Lift: 1.00 = unrelated; >1 hit together; <1 get in each other's way. If the model's lift > actual, EV is too rosy.
- PrizePicks facts: payouts vary per entry and promo; one pick per player; at least 2 teams; TD props More-only
  (often demons with their own payout); goblins/demons are alt lines with lower/higher payouts.

## 10. Open questions / pre-registered checks (decide after Week 4 Sunday grading, not mid-week)
1. v6 centering: More rate at the market line within ~2 pts of predicted -> set the safety cut to 0.
2. Range width: check middle-50/80 coverage on Wk4 with v6.4; if yardage still wide, test 0.90; if counts are wide,
   test a count-stat factor (upper-tail trim x0.82 was the v5-era candidate).
3. Raw-model blend: raw side won 54.3% of 15+ point disagreements on Wk3 Sunday (n=387), 3 of 7 Monday. Needs 2+
   weeks above ~53% before blending part of the raw model back in. Keenum (backup QB) 247 vs 169.5 line was the
   big raw win - watch backup-QB overs.
4. Shares: carries switch to the refreshed blend if it beats the model's own shares again on Wk4.
5. TDs: grade Anytime TD and Pass TD calibration and same-team TD pairs from Wk4 on.
6. Correlation settings: re-run the harness mid-season with 2026 games added.
7. Top Entries overlap: many entries reuse the same legs; consider capping how often a leg appears.
8. Ideas not yet built: a "check against PrizePicks board" import, grade_game raw-disagreement report, per-leg
   reuse cap, automatic inactives check.
