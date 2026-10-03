# PrizePicks NFL Confidence Model

Weekly NFL player-prop model for PrizePicks entries, built for The Fantasy Playbook. Market-centered Monte Carlo
simulation (5,000 games per matchup) with validated same-game correlations, producing a Google-Sheets-friendly
report with an Entry Builder (PLAY / SKIP verdicts) and web-ready JSON.

Start with `CLAUDE.md`, then `docs/RUNBOOK.md`.

Quick start (from `pipeline/`):
```
pip install -r ../requirements.txt
copy ..\.env.example ..\.env        (Windows)   |   cp ../.env.example ../.env   (Mac/Linux)   -> add SGO_API_KEY
python fetch_data.py
python run_slate.py prep --replay snapshots/sgo_slate_2026-10-01_final.json
python run_slate.py build --title "Replay test" --out ../reports/_replay.xlsx
```
Live slate: `python run_slate.py prep --start 2026-10-04T12 --end 2026-10-05T12`, confirm injuries in
`apply_outs.py`, then `python run_slate.py build --title "Week 4 Sunday" --out ../reports/Slate_Report_Wk4_SUN.xlsx`.
