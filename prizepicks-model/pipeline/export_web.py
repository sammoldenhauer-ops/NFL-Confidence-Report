"""Export the current slate for the website (run after slate_book3.py / ladders.py).
Usage: python export_web.py "<slate title>" [out_dir]     (default out_dir ../reports/web)
Writes:
  slate.json  - games, every leg (book line, market chance, ladder), top entries, injuries/notes, settings, payouts
  sims.json   - {"n": 2000, "keys": ["Player | Stat", ...], "cols": [[int,...], ...]}  (same row = same simulated game)
The website's Entry Builder must follow docs/ENTRY_MATH_SPEC.md using sims.json. Ledgers/bankroll are NOT exported.
"""
import sys, os, json, pickle, datetime, numpy as np, pandas as pd
TITLE = sys.argv[1] if len(sys.argv) > 1 else 'Slate'; OUT = sys.argv[2] if len(sys.argv) > 2 else '../reports/web'
os.makedirs(OUT, exist_ok=True); NS = 2000
S = pickle.load(open('slate_sims_centered.pkl', 'rb')); L = pd.read_pickle('slate_legs_final.pkl'); E = pd.read_pickle('slate_entries.pkl')
G = pd.read_pickle('slate_games.pkl'); I = pickle.load(open('slate_inputs.pkl', 'rb')); R = pd.read_pickle('ladder_rows.pkl')
games = []
for g in G.itertuples():
    m = float(g.home_exp_margin)
    games.append({'game': f'{g.away} @ {g.home}', 'home': g.home, 'away': g.away, 'kickoff_utc': str(g.start),
                  'favorite': g.home if m > 0 else (g.away if m < 0 else None), 'spread': abs(m), 'total': float(g.total)})
legs = []
for x in L.itertuples():
    lad = R[(R['Player'] == x.player) & (R['Stat'] == x.stat)].sort_values('Line')
    legs.append({'key': f'{x.player} | {x.stat}', 'player': x.player, 'team': x.team, 'game': f'{x.away} @ {x.home}', 'stat': x.stat,
                 'book_line': float(x.line), 'p_more': round(float(x.p_more), 4), 'p_less': round(float(x.p_less), 4),
                 'ladder': [{'line': float(r.Line), 'pick': r.Pick, 'chance': round(float(r.Confidence), 4)} for r in lad.itertuples()]})
entries = [{'size': int(e.size), 'legs': list(e.legs), 'leg_probs': [float(p) for p in e.leg_probs], 'p_all': round(float(e.p_all), 4),
            'combo_corr': float(getattr(e, 'combo_corr', 1.0))} for e in E.itertuples()]
notes = I.get('notes', pd.DataFrame(columns=['team', 'player', 'status', 'note']))
slate = {'title': TITLE, 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
         'model_version': 'v6.4', 'games': games, 'legs': legs, 'top_entries': entries,
         'injuries': {'outs_handled': I['flags'].to_dict('records'), 'notes': notes.to_dict('records')},
         'settings': {'safety_cut': 0.01, 'cushion_per_leg': 0.05, 'kelly_fraction': 0.25, 'free_space_chance': 0.99},
         'standard_payouts': {'power': {2: 3, 3: 5, 4: 10, 5: 20, 6: 37.5}, 'flex_all': {3: 2.25, 4: 5, 5: 10, 6: 25},
                              'flex_1miss': {3: 1.25, 4: 1.5, 5: 2, 6: 2}, 'flex_2miss': {5: 0.4, 6: 0.4}},
         'stack_corrections': {'qb_pass_yds_plus_2_same_side_receiving': 0.95, 'qb_pass_yds_plus_3plus': 0.90,
                               'qb_pass_tds_more_plus_teammate_td_more': 0.90}}
json.dump(slate, open(f'{OUT}/slate.json', 'w'), default=lambda o: o.item() if hasattr(o, 'item') else str(o))
keys = list(dict.fromkeys(l['key'] for l in legs))
cols = [np.asarray(S[tuple(k.split(' | '))])[:NS].round().astype(int).tolist() for k in keys]
json.dump({'n': NS, 'keys': keys, 'cols': cols}, open(f'{OUT}/sims.json', 'w'), separators=(',', ':'))
print(f'wrote {OUT}/slate.json ({len(legs)} legs, {len(entries)} entries) and sims.json ({len(keys)} x {NS})',
      f'| sizes: {os.path.getsize(f"{OUT}/slate.json")//1024} KB, {os.path.getsize(f"{OUT}/sims.json")//1024} KB')
