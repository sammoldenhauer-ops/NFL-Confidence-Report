# Changes since the last transfer (v5 handoff, Sep 28, 2026) -> v6.4 model / v7 report (Oct 1, 2026)

The previous handoff was model v5 (event-by-event simulation + game-script layer + market centering) with the
report layout By Player / By Stat & Confidence / Player Summary / Top Entries / Combo Builder / Likely Out /
Payouts / Assumptions. Everything below happened after that, in order.

## 1. Monday Wk3 run (PHI @ CHI) - process fixes
- The sim keeps ONE QB per team. With three CHI QBs on the board (Williams out, Keenum starting, Bagent backup) it
  would have used the wrong one. `apply_outs.py` was created: drops lines for confirmed outs and non-starting QBs,
  redistributes only confirmed-out shares.
- Goedert (out) still had stale lines on the board - outs' lines must be removed, not just their shares.

## 2. Payouts are dynamic (correction)
- PrizePicks sets the multiplier per entry from the chosen lines and promos. A "Guarantee Pick" promo 4-pick paid
  5.25x, about a normal 3-pick rate - NOT the 10x the old math assumed (the +135% EV claim was wrong; it was about +5% to +26%).
- Rule since then: always use the app's "To Win" multiplier. Standard payouts are only a fallback.

## 3. v6 centering fix (Sep 29) - the biggest bug found
- v5 treated SportsGameOdds' `fairOverUnder` as a 50/50 median. SGO pairs it with its own `fairOdds` (e.g. Hurts:
  fair 224.5 was only 42% over; the 218.5 book line was ~50/50). Every center sat too high.
- Evidence (640 graded props, Wk3): v5 said More 53.6% at market lines vs 51.1% actual; its 57%+ leans hit 53%
  (predicted 64%); Receptions leans 66% vs 50%; Rush Yds worst. Brier at the line was no better than a coin flip.
- Fix: scale each range so P(sim > BOOK line) = the book's no-vig over probability at that line (from over/under
  odds). Average gap to market 0.5 pts. The old "3-point haircut" was mostly this bug -> default cut now 1 pt.
- Entry builder's sanity check updated to the new target (it was dropping 13 correctly-centered legs).

## 4. Share fixes (Sep 29)
- Model shares come from play-by-play (EWM, half-life 6 games). The blended share file was supposed to be the
  fallback for players with <2 games but the code looked it up and discarded it - fixed (1 game -> 50/50 mix,
  0 games -> blended).
- Share file had duplicate players from name variants (Mike Washington / Mike Washington Jr. LV, Ted Hurst /
  Ted Hurst III TB) - merged with the file's own weights; collision check now built in.
- New `refresh_shares.py`: refreshes blended shares weekly (weight = games/(games+2.33) targets, games/(games+1.86)
  carries - the file's original 30%/35%-per-week rule), adds new players, stops on name collisions.
- Test (blend through Wk2 -> predict Wk3): targets model 5.98 vs blend 6.17 avg miss (model better);
  carries model 12.61 vs blend 11.50 (blend better). Pre-registered: switch carries to blend if it wins Wk4 too.

## 5. Anytime TDs added (v6.1, Sep 29)
- Line source: SGO `touchdowns` yes/no market (FanDuel, Caesars, DraftKings, BetMGM), margin removed. The ou version
  and the one-sided rushing/receiving TD markets are inconsistent - not used.
- Sim: team TDs from simulated team points (0.106 TDs per point), split pass/rush, handed to players by volume x
  red-zone (targets inside the 20) / goal-line (carries inside the 5) usage. QB Pass TDs = team receiving TDs.
- Red-zone/goal-line weighting beat plain volume share on held-out late-2025 games (log loss 0.3989 vs 0.4020).
- Centering thins or boosts each player's TDs to the market's no-vig chance.
- Entries use TD legs on More only (PrizePicks TD props are More-only, usually demons with their own payout).

## 6. Stack correlations re-tuned (v6.2 -> v6.3, Sep 30)
- Problem: the sim had receivers not competing for targets and no shared game environment, so it overrated
  same-team 3-4 leg stacks and missed shootouts (QB + opposing QB).
- Added settings: receiver share competition (SH_SD 0.6), shared game-scoring swing (TOT_SD 6) with efficiency link
  (EFF_B 0.6), carry competition (CS_SD 0.5), game-level pass/rush TD lean (PF_K 20), goal-line role lean (GL_SD 1.0).
- First tuned on Monday's 2 teams only (Sam caught this). Re-tuned properly on 206 historical games / 412 team-games
  (2024-25 wks 6-18) with matchup-adjusted lines, fit-on-half / test-on-other-half: held-out error 5.96 (no tuning)
  vs 1.35-2.69 (tuned). Every combo inside its 80% range except QB 2+ pass TDs + his WR1 TD (sim 1.70 vs 1.53).
- These settings widened ranges ~20%, so `slate_copula.py` keeps each player's own range from a run without them and
  takes only the joint behaviour (rank order) from the tuned run.
- Combo corrections in the entry builder (and the Entry Builder sheet): QB Pass Yds + 2 same-team receiving legs on
  the same side (all More or all Less) x0.95, + 3 or more x0.90; QB Pass TDs More + same-team TD More x0.90.
- Effect (Monday slate, standard payouts): best 4-leg EV +53% -> +36%, 6-leg +196% -> +130%.

## 7. Range width (v6.4, Sep 30)
- Re-ran the current model on Wk3 Sunday's actual book lines (598 props, 14 games, pre-game data only): v5 had 64% of
  results in the middle 50% / 90% in the middle 80%; after v6 it was 54.5% / 83.6% (centering fix removed most of it).
- Yardage ranges narrowed 5% around the book line (WIDTH_YDS 0.95; the line's own % is unchanged). Leave-one-game-out:
  best factor 0.90-1.00 every time; held-out gap 1.84 -> 1.48 pts. After: 51.5% / 78.9% (target 50 / 80).
- Model's own TD rates are ~20% low (25% vs 31%) because actual TDs spread across more players; a fix exists
  (TD_REPEAT) but breaks validated TD pair links, so it is off. No report impact (TD props are market-centered).
  Do not trust "2+ TDs" numbers.

## 8. Entry ledger and grading
- `grade_game.py` grades any game set. `ledgers/Entry_Ledger.csv` holds Sam's actual entries (Monday Wk3: 5 x $1
  Power, 1 win, +$1.25; picks 8-7; Hurts Rush 26.5 on PrizePicks vs 24.5 at books missed by 1.5 twice).
- Odds snapshots are saved per pull (needed to test centering later; SGO drops odds after kickoff).

## 9. Report v7 (Oct 1) - `slate_book3.py`
- 14 tabs -> 8 visible: Start Here | Entry Builder | Top Entries | Best Legs | Player Lines | Injuries & Notes |
  Learn the Math | Settings (hidden: Sims, Lists, Calc).
- Entry Builder merges the old Combo Builder + Entry Calculator: Player -> Stat -> More/Less -> Line dropdowns,
  Free space (promo) column, Power/Flex, app multiplier(s), bankroll; verdict PLAY / SKIP / FIX LEGS; rule checks;
  stack corrections; safety cut; cushion; quarter-Kelly stake; "Show the math". Verified against Python.
- Google Sheets fix: dependent dropdowns originally used OFFSET formulas, which Google Sheets mis-reads (showed the
  key column). Now each leg has its own helper list on the hidden Lists sheet (plain ranges).
- `apply_outs.py` NOTES feed the Start Here and Injuries & Notes tabs.

## 10. Wk4 TNF (PIT @ CLE, Oct 1) - current slate
- PIT -2.5, total 39. Outs: Rico Dowdle (toe). Redistributed 28% of carries (not his ~40%: Warren's weighted share
  already includes the Wk3 game without Dowdle; 28% puts Warren at 0.807 vs his 0.81 no-Dowdle share) and 9.5% targets.
- KC Concepcion auto-flagged as likely out - FALSE (healthy; SGO feed lacked his lines). Not redistributed.
- Notes: Porter Jr. out, Ramsey/Echols questionable, Elgton Jenkins out, Tylan Wallace not official.
- Best entries at standard payouts: 4-leg +17% (below the +20% cushion -> skip), 5-leg shootout stack +47%,
  6-leg +64%. Strongest single legs: Raheim Sanders Receptions More 1.5 (60%), Denzel Boston Receptions More 2.5 (57%).
- Process slip worth remembering: I once reported the favorite backwards (said CLE -2). SGO `home_exp_margin`
  negative = AWAY team favored. Double-check spread direction before stating it.

## 11. Payout Finder tab (Oct 1, game day)
- Sam's request: save trips between the app and the Entry Builder. New tab lists the top 10 entries per size with the
  minimum multiplier each needs to be a PLAY and an EV grid across multiplier steps (0.25x for 2-4 legs, 0.5x for 5,
  1x for 6), coloured green/amber/red. Verified against Python. Game-day lines re-pulled (Rodgers 214.5, Metcalf rec
  45.5, Warren rush 75.5, Freiermuth rec 26.5); Joey Porter Jr. reported traded to Dallas.

## 12. Packaging for Claude Code (this transfer)
- API key moved out of code into `.env` (`SGO_API_KEY`); `pull_lines.py` uses urllib (no curl) and saves a dated
  snapshot every pull; `fetch_data.py` replaces the bash downloader; `run_slate.py` runs the whole slate in two
  phases; harness paths are relative. Replay test of the Wk4 TNF snapshot reproduced the delivered report exactly
  (67 legs, 619 dropdown lines, Warren 0.807, best 4-leg +17.2%, 0 formula errors).
