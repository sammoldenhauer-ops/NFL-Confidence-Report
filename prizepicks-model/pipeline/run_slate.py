"""One-command slate runner. Run from the pipeline/ folder.

Phase 1 - prep (pull lines, build board + inputs, show likely-out flags):
    python run_slate.py prep --start 2026-10-04T12 --end 2026-10-05T12
    python run_slate.py prep --replay snapshots/sgo_slate_2026-10-01_final.json      # rebuild a past slate offline

Then: check injury news / official inactives and edit DROP_LINES, OUTS and NOTES at the top of apply_outs.py.
      (Only CONFIRMED outs get their share redistributed. Auto 'likely out' flags were wrong 5 of 11 times.)

Phase 2 - build (apply outs, simulate, center, entries, ladders, report):
    python run_slate.py build --title "Week 4 Sunday" --out ../reports/Slate_Report_Wk4_SUN.xlsx

Weekly extras: python refresh_shares.py <last completed week>   |   python grade_game.py <week> <game_ids>
"""
import argparse, subprocess, sys, shutil, pickle, os
PY = sys.executable
def step(*args):
    print(f'\n>>> {" ".join(args)}', flush=True)
    r = subprocess.run([PY, *args])
    if r.returncode != 0: sys.exit(f'FAILED at: {" ".join(args)}')
ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
p = sub.add_parser('prep'); p.add_argument('--start'); p.add_argument('--end'); p.add_argument('--replay')
b = sub.add_parser('build'); b.add_argument('--title', required=True); b.add_argument('--out', default='../reports/Slate_Report.xlsx'); b.add_argument('--web', default='../reports/web')
a = ap.parse_args()
if a.cmd == 'prep':
    if a.replay: shutil.copy(a.replay, 'sgo_slate.json'); print('replaying', a.replay)
    elif a.start and a.end: step('pull_lines.py', a.start, a.end)
    else: sys.exit('give --start/--end (UTC) or --replay <snapshot>')
    step('slate_board.py'); step('slate_inputs.py'); step('td_params.py')
    I = pickle.load(open('slate_inputs.pkl', 'rb'))
    print('\nAUTO "LIKELY OUT" FLAGS (recent role, no line) - VERIFY EACH, do not trust blindly:')
    print(I['flags'].to_string() if len(I['flags']) else '  none')
    print('\nNext: edit DROP_LINES / OUTS / NOTES in apply_outs.py with CONFIRMED outs only, then run: python run_slate.py build --title "..."')
else:
    step('apply_outs.py'); step('slate_copula.py'); step('slate_center.py'); step('slate_entries2.py'); step('ladders.py')
    step('slate_book3.py', a.title, a.out)
    step('export_web.py', a.title, a.web)
    print(f'\nReport written: {a.out}  (Excel / Google Sheets calculate the formulas on open.)  Web data: {a.web}/')
