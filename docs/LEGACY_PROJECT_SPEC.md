# The Fantasy Playbook — NFL Confidence Report Engine
### Project Spec for Claude Code / Vercel Build

This document is the full handoff spec for turning this season's analytics workflow into a
persistent, self-updating web app. Everything in here reflects methodology that was empirically
tested and validated against real historical and current-season NFL data — none of the weights
or corrections below are arbitrary guesses. Treat this document as the source of truth for how
the model should behave; the chat history that produced it also exists but this file is the
distilled, authoritative version.

---

## 1. What this app does

Takes real sportsbook prop lines (passing/rushing/receiving yards, receptions, TDs, team
totals/spreads) for upcoming NFL games, runs a Monte Carlo simulation against our own player/team
projections, and outputs a confidence percentage (our estimated real probability that the prop
hits) for every line. It then grades those confidence percentages against real final results once
games are played, and uses that feedback loop to keep correcting the model over time.

The two halves of the app:
- **Prediction side**: ingest lines → simulate → output confidence % report (3 tabs: All Lines,
  Favorites [odds -100 to -250], Underdogs [positive odds])
- **Grading/calibration side**: pull real final box scores → grade every logged prop as hit/miss →
  track calibration (predicted confidence vs. actual hit rate) in buckets (e.g. 40-50%, 50-60%,
  etc.) over time, to catch and correct systematic over/under-confidence

---

## 2. Real, live NFL data sources (all free, no API key required)

All data comes from **nflverse**, a maintained, public GitHub release system. These update
automatically during the season — the app should pull from the *latest* release each time, not
a cached snapshot.

- **Play-by-play data** (the core data source for everything):
  `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz`
  Contains every play with `posteam`, `defteam`, `passer_player_id`, `receiver_player_id`,
  `rusher_player_id`, `passing_yards`, `rushing_yards`, `receiving_yards`, `epa`, `week`, `game_id`,
  and real scoring fields (`posteam_score_post`). This is gzipped CSV — pull, decompress, load.

- **Player ID reference** (needed to resolve names from IDs — critical, see Section 5):
  nflverse `players` release — maps `gsis_id` → `display_name`. Never join on raw name strings.

- **Snap counts** (for verifying real in-game injuries/role changes):
  `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_{season}.csv`
  Has `offense_snaps`, `offense_pct` per player per game — this is the ONLY reliable signal for
  "did this player's role actually shrink," not box-score production (see Section 7, Lesson 5).

- **Weekly aggregated player stats** (targets, shares, touches — useful for historical backtesting):
  nflverse `player_stats` weekly release, or aggregate your own from play-by-play (preferred,
  since `player_stats` lags behind pbp for the current season).

The app needs a scheduled job (Vercel Cron, or a simple `fetch`-on-page-load with revalidation) to
re-pull these files periodically during the season — pbp updates within hours of each game ending.

---

## 3. Core validated methodology — apply exactly as specified

### 3.1 Monte Carlo simulation
- Minimum **50,000 simulations** per prop; scale to 250,000 for final/high-stakes builds.
- Normal distribution `np.random.normal(mean, sd, N)`, clipped at 0 (`np.clip(..., 0, None)`).
- TD props use Poisson, not normal (validated — see Section 3.4).

### 3.2 The SD correction — CRITICAL, always apply
Backtesting against real graded results (2,600+ props) showed the model's raw standard deviations
were **systematically too narrow**, causing overconfidence in the 40–90% range specifically (the
extremes were already well-calibrated). The fix, validated by grid search:

```
corrected_sd = raw_model_sd * 1.30
```

Apply this multiplier to every SD used in simulation, every time, no exceptions. Real before/after
comparison on held-out data: the 70-80% confidence bucket went from a -8.4 point gap (overconfident)
to +1.6 (well-calibrated) after this correction. The 40-60% range still shows a residual, unsolved
gap after this fix — this is a known, real open problem (see Section 7).

### 3.3 Season-blend weighting — for both player shares and team-level projections
Two different, separately-validated weight sets — do not conflate them:

**Player target/rush/touch share** (blending preseason baseline with real current-season data):
- Target share: **70% prior baseline / 30% current-season actual** (validated via 858 real
  player-seasons, 2022–2025 backtest, MAE-minimizing grid search)
- Rush share: **65% prior baseline / 35% current-season actual** (RB roles shift faster than WR
  target shares — validated separately, 400 real RB player-seasons)
- Touch share: 75/25 (less central to current build, computed similarly if needed)

**Team-level scoring formula** (a 4-window weighted model — see Section 4 for the full formula):
- Time windows: Year-to-date (current season), Last-3-games, Home/Away split, Previous season
- Validated weight for early-season use: **20% YTD / 0% L3 / 0% H-A / 80% Previous season**
  (this is the user's own specified weighting — do not substitute the 85/15 finding from the
  simpler backtest done earlier in the session; the 20/0/0/80 four-window formula supersedes it
  for team scoring specifically)
- This weighting should shift toward more current-season weight as more games accumulate — build
  this as a configurable parameter, not a hardcoded constant, since the right weight legitimately
  changes as the season progresses.

### 3.4 TD props: use Poisson, not normal
Tested directly: real QB passing-TD counts (multi-season historical) show a variance-to-mean ratio
of ~0.90 — essentially matching Poisson's theoretical 1.0. A negative binomial (for overdispersion)
was tested and is NOT warranted. Use `poisson.cdf` / `np.random.poisson`, never normal, for any TD
count prop.

### 3.5 Yardage distribution shape: normal is fine, despite real skew existing
Real historical receiving/rushing yardage shows genuine right-skew (~0.9–1.0 skewness coefficient,
confirmed from 5,800+ real WR games and 2,300+ real RB games). A skew-normal correction was tested
directly against real graded results and made calibration measurably WORSE (gaps went from -2/-4 to
-9/-14). Keep plain normal distribution for yardage; do not "fix" this without new evidence.

---

## 4. The full team-score formula (exact spec, do not approximate)

This is the user's own established model, reconstructed and validated this season. Variables:

```
A = team's own points/game, this season (YTD)
B = team's own points/game, last 3 games
C = team's own points/game, home-or-away split (whichever applies to this game)
D = team's own points/game, last season (REGULAR SEASON ONLY — exclude playoff games, weeks 19+)

E, F, G, H = league-average points SCORED across those same 4 windows
I, J, K, L = the OPPONENT's points ALLOWED across those same 4 windows
M, N, O, P = league-average points ALLOWED across those same 4 windows (tracked separately from
             E-H even though they're equal in aggregate — keep as distinct fields)

Weight1 (YTD), Weight2 (L3), Weight3 (H/A), Weight4 (PrevSeason) — must sum to 100
Currently: Weight1=20, Weight2=0, Weight3=0, Weight4=80 (see Section 3.3)
```

Calculation (run once for the home team, mirror for the away team with roles swapped):

```
Q = SUMPRODUCT({A,B,C,D}, {W1,W2,W3,W4}) / 100        # weighted own offense
R = SUMPRODUCT({E,F,G,H}, {W1,W2,W3,W4}) / 100        # weighted league scoring average
S = Q / R
T = Q * S                                              # "Expected" offensive output

V = SUMPRODUCT({I,J,K,L}, {W1,W2,W3,W4}) / 100        # opponent's weighted points allowed
W = SUMPRODUCT({M,N,O,P}, {W1,W2,W3,W4}) / 100        # weighted league-allowed average
X = V / W
Y = V * X                                              # "Expected" points allowed by opponent

Z = (T + Y) / 2                                        # final projected points
final_score = MROUND(Z * injury_multiplier, 0.5)       # round to nearest 0.5
```

`injury_multiplier` is a real, separate lookup — not yet built (see Section 7, open item). Default
to 1.0 until that system exists.

**Sanity check requirement**: the derived spread MUST match the sign of the two Proj. Score numbers
— whichever team's Z is higher must show as the favorite (negative spread). This broke repeatedly
during manual construction this season; build it as a computed field directly from the two Z
values, never hardcoded or copied from Vegas's sign convention.

---

## 5. Data integrity — non-negotiable checks, every single build

These are real bugs that recurred multiple times this season. Build them as automated tests/checks
in the pipeline, not manual reminders:

1. **Player ID matching, never name-string matching.** Grading player stats against real results
   must join on `gsis_id`/`passer_player_id` etc., never on name strings. A same-surname collision
   (e.g. "Amon-Ra St. Brown" vs "A.J. Brown" both naively abbreviate to "A.Brown") silently
   corrupted an entire game's grading before this was caught.

2. **Duplicate-name detection on every player-share dataset.** Before finalizing any target/rush/
   touch share table, normalize every player name (strip apostrophes, periods, "Jr."/suffix
   variants, lowercase, strip whitespace) and check for collisions within the same team. Real
   examples that broke this: "Ja'Kobi Lane" vs "Jakobi Lane", "Chris Godwin" vs "Chris Godwin Jr.",
   "Kenneth Gainwell" vs "Kenny Gainwell".

3. **A verbal/conversational correction is not a data fix until it's written to the actual source
   file and re-read to confirm.** This recurred at least 3 times this season (a roster correction
   was "fixed" in one response but the underlying model file was never actually updated, so the
   stale data silently resurfaced in later work). Any correction pipeline needs a write-then-verify
   step, not just an acknowledgment.

4. **Real in-game injury detection must use snap-count data, not box-score production.** A player
   with real zero production but normal snap participation just had a bad game — that's valid
   calibration data and must NOT be excluded. A player with a real, verified drop in `offense_pct`
   (e.g., below 50% of their established baseline) is a legitimate injury-exclusion candidate.
   Even then, treat it as a candidate for human confirmation, not an automatic exclusion — box-
   score-based heuristics produced real false positives (flagged two players who simply had bad
   games, not injuries) when tested this season.

5. **Team assignment must be re-verified every single week**, not assumed static. Real, confirmed
   in-season trades happened multiple times this year (e.g., a WR moving teams). A player's team
   in any stored model file can go stale silently — cross-check current-week snap/target data
   against stored team assignment before building projections, and flag mismatches.

---

## 6. Card/report formatting rules (if a visual matchup-card feature is built)

If the app includes a visual "matchup card" generator (rankings, best/worst matchups, prop tables):

- **Pill/highlight color must reflect whether the underlying fact is good or bad news for the
  featured player specifically** — never the raw number's face value, and never defaulted to a
  neutral color when the answer is clearly one or the other. An elite opposing defense is bad news
  for a player in a "best matchup" box (color it negatively) even though the player is favored
  overall for other reasons stated in that box.
- **Never use a player's own-team target hierarchy as a "negative" matchup factor** (e.g. "WR2
  behind the WR1 in targets"). That's true of that player in literally every game regardless of
  opponent — it's not matchup-specific signal. Negatives must be tied to how that player's own
  skillset interacts with what the specific opposing defense does well.
- **Every specific factual claim in card text** (who leads a team in a stat, target counts, "player
  X is behind player Y") must be checked against real data before being written — never assumed.
- **The team spread sign must be derived directly from the two projected-score numbers**, never
  copied from Vegas's favorite or hardcoded.
- When rebuilding one section of a card, carry over every category/field that existed on the prior
  version — don't silently drop fields on a partial rebuild.
- Avoid the words "real," "genuinely," "genuine," and "honestly" in any user-facing text — reads as
  artificial. (This was a standing style preference from the original chat workflow; carry it
  into any generated report/card text if that feature is built.)

---

## 7. Known open problems — don't treat these as solved

- **The 40–60% confidence bucket still shows a real, unresolved overconfidence gap** even after
  the 1.30x SD correction (roughly -6 to -9 points, hasn't been reduced by any tested fix so far).
  This wasn't traced to a single stat type or data source. Worth continued investigation once more
  weeks of real graded data accumulate — larger sample sizes may reveal whether this is a genuine
  structural issue or noise.
- **Team-level score projections have a real, only-partially-solved discrepancy issue.** An earlier
  quick-and-dirty version (volume-ratio TD scaling) was replaced by the proper 4-window formula in
  Section 4, but that formula hasn't yet been extensively backtested the way the player-level
  corrections have. Treat team score outputs with more caution than player prop outputs until
  that validation work is done.
- **Injury-impact quantification exists only for QBs, not skill positions.** A real, statistically
  significant relationship was found between starting-QB quality (EPA/play) and the real point
  swing when that QB is out (`point_drop ≈ 20.08 × starter_EPA + 2.32`, p<0.0001, real historical
  backtest). No equivalent, statistically-significant relationship was found for RB/WR/TE absences
  — tested directly and it came back null (p > 0.3 across the board). Do not build an unproven
  skill-position injury-scoring formula; continue using direct share-redistribution (a human or
  rules-based reassignment of the missing player's share to their real replacement) for those
  cases instead.
- **No automated "player is out" detection yet** — this season, injury status was manually cross-
  referenced against a weekly ESPN injury report PDF and confirmed player-by-player. A real,
  live injury-report data source (ESPN's or a similar feed) should be identified and integrated if
  this is to run without manual weekly input.

---

## 8. Suggested tech stack / structure

- **Framework**: Next.js on Vercel (natural fit for the user's stated Claude Code / Vercel intent)
- **Database**: Postgres (Vercel Postgres or Supabase) — needed for the calibration ledger, which
  must persist and grow across the whole season, not just live in flat files
- **Core tables**:
  - `players` (gsis_id, display_name, team, position) — refreshed from nflverse player reference
  - `player_projections` (player_id, week, season, mean_stat, sd_stat, stat_type, source) —
    the model's own output, versioned by week
  - `share_overrides` (player_id, team, week, season, target_share_pct, rush_share_pct, reason,
    expires_after_week) — for the temporary, game-specific redistribution overrides (injuries,
    role changes) — critically, these must NOT overwrite the permanent baseline share table
  - `props` (player_id, stat_type, line, odds, side, confidence_pct, our_mean, game_id, week,
    season, source_file)
  - `graded_props` (props.id FK, actual_result, hit boolean, graded_at)
  - `calibration_summary` (materialized/computed view: bucket, n, hit_rate, avg_confidence, gap)
- **Scheduled jobs**: weekly pull of new pbp/snap-count data (Vercel Cron), re-run grading against
  any newly-completed games, recompute calibration summary
- **Core pages/features**:
  1. Upload/paste prop lines (or scrape, if a legal/ToS-compliant path exists) → run simulation →
     view 3-tab confidence report (All/Favorites/Underdogs)
  2. Share override manager (a simple form: player, team, new share %, reason, this-week-only
     toggle) so in-season adjustments don't require touching code
  3. Calibration dashboard — bucket table + gap chart, filterable by week/season, with the
     duplicate/injury-exclusion checks from Section 5 built in as automated data-quality gates
  4. (Optional) Matchup card generator following Section 6 rules

---

## 9. What to hand Claude Code alongside this document

Provide these as a starter dataset so the app launches with real, in-season data already loaded
rather than starting from zero:

- `FULL_LEAGUE_TARGET_AND_RUSH_SHARES.csv` — current blended player share baseline, all 32 teams
- `Sunday_Games_Graded_Full_Report_FIXED.csv` — the full real, graded calibration history so far
  this season (thousands of real graded props, ID-matched, already cleaned of the known bugs)
- `Sunday_Games_Calibration_Report_FIXED.csv` — the current calibration bucket summary
- `This_Week_Share_Overrides.csv` — the active, in-progress temporary overrides for the coming week
- All per-team `{team}_{position}_MEAN_SD_projections.csv` files — the current player projection
  baselines that the simulation draws from

This lets the very first deploy already reflect a full season's worth of validated corrections
instead of rebuilding the methodology from scratch inside the new codebase.
