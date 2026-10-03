# PrizePicks NFL Confidence Model (part of The Fantasy Playbook)

Sam's weekly NFL player-prop model for PrizePicks entries (2-6 legs). It pulls sportsbook lines, simulates every
game 5,000 times, centers each player on the market, and produces a spreadsheet report with an Entry Builder that
says PLAY or SKIP. Slates run Thursday, Sunday and Monday. Model v6.4, report v7 (as of Oct 1, 2026).

## Read these first (in order)
1. `docs/CHANGELOG_SINCE_LAST_TRANSFER.md` - what changed from v5 to v7 and why (with the evidence)
2. `docs/RUNBOOK.md` - exact weekly process, commands, injury handling, grading
3. `docs/KNOWLEDGE_BASE.md` - how the model works, every formula and setting, validation results, open questions
4. `docs/ENTRY_MATH_SPEC.md` - the Entry Builder math, precise enough to port to the website
5. `docs/WEBSITE_INTEGRATION.md` - plan for running this from the website repo and showing it on the site
6. `docs/PREFERENCES.md` - how Sam wants things explained and the rules he has set (some are strict)
`docs/HISTORY_handoff_log_v7.md` is the raw running log from the chat sessions - reference only.

## Layout
- `pipeline/` - all model code + small parameter files. Run every script FROM this folder.
- `pipeline/snapshots/` - saved odds pulls (odds disappear after kickoff; keep every pull).
- `harness/` - historical backtest tools (206 games) used to tune correlations. Not part of the weekly run.
- `ledgers/` - graded results and Sam's actual entries. Private - never publish.
- `reports/` - generated .xlsx reports.

## Commands (from pipeline/)
- Setup once: `pip install -r ../requirements.txt`, copy `../.env.example` to `../.env` and add `SGO_API_KEY`,
  then `python fetch_data.py` (~5 min; re-run before each slate so play-by-play is current).
- Slate: `python run_slate.py prep --start <UTC> --end <UTC>` -> confirm injuries, edit `apply_outs.py` ->
  `python run_slate.py build --title "Week N Sunday" --out ../reports/Slate_Report_WkN_SUN.xlsx`
- Offline replay of a saved slate: `python run_slate.py prep --replay snapshots/<file>.json`
- After games: `python grade_game.py <week> <game_id,...>` BEFORE running the next slate (it reads the current pickles).
- Weekly: `python refresh_shares.py <last completed week>`

## Non-negotiable rules
1. **Do not change model constants or logic without validating** (held-out backtest via `harness/`, or grading on
   graded slates) and documenting before/after numbers in `docs/KNOWLEDGE_BASE.md`. Every current setting has a test
   behind it. Decide pre-registered checks only after the grading they wait on (see KNOWLEDGE_BASE "Open questions").
2. **Injuries: only CONFIRMED outs get redistributed.** Auto "likely out" flags were wrong 5 of 11 times and once
   flagged a healthy starter (KC Concepcion, just missing from the odds feed). Verify with official reports/inactives.
3. **Never change a player's team from memory.** Trust the data or Sam.
4. **Verify any stat before stating it** (counts, ranks, who leads a team). Never infer from memory or pattern.
5. **Name-collision check** every time a player-share file changes: normalize names (lowercase, strip punctuation,
   suffixes Jr/Sr/II/III/IV) and check duplicates within a team (`refresh_shares.py` does this and stops on a hit).
6. **Never use the words "genuine", "genuinely", "real", or "honestly"** in anything Sam reads - chat, docs, report
   text, site copy, card text. Grep generated files for them.
7. **Spreadsheet output must have zero formula errors** and must work in **Google Sheets** (Sam uses Sheets on his
   phone): no OFFSET/INDIRECT inside data-validation lists, no XLOOKUP/FILTER/SORT/UNIQUE/SEQUENCE. Verify numbers,
   not just "no errors" (see RUNBOOK "Verifying a report").
8. **Grade before re-running.** Running a new slate overwrites the pickles grading needs.
9. **Never commit `.env`, raw play-by-play, or ledgers to a public repo.** The API key lives only in `.env` /
   deployment secrets.
10. Sam is learning the betting math: explain plainly, lead with the answer, short and mobile-friendly.
