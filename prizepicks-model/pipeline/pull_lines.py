# Usage: python pull_lines.py 2026-10-04T12 2026-10-05T12   (UTC window; Sunday = Sun 12:00 to Mon 12:00 UTC covers SNF)
# Needs SGO_API_KEY in .env (repo root) or the environment. Writes sgo_slate.json AND a dated copy in snapshots/.
import json, sys, os, urllib.request, datetime
from _env import load_env
load_env(); K = os.environ.get('SGO_API_KEY')
if not K: sys.exit('Set SGO_API_KEY in .env (see .env.example)')
lo, hi = sys.argv[1], sys.argv[2]; ev = []; cur = None
for i in range(12):
    url = f"https://api.sportsgameodds.com/v2/events?apiKey={K}&leagueID=NFL&oddsAvailable=true&limit=10" + (f"&cursor={cur}" if cur else "")
    try:
        with urllib.request.urlopen(url, timeout=60) as r: d = json.loads(r.read().decode('utf-8'))
    except Exception as e:
        print('error:', e); break
    if not d.get('success'): print('error:', d.get('error')); break      # 'Rate limit exceeded' on a later page is normal
    ev += d.get('data', []); cur = d.get('nextCursor')
    if not cur: break
sl = [e for e in ev if lo <= e['status']['startsAt'] < hi and any(o.get('playerID') for o in (e.get('odds') or {}).values())]
json.dump(sl, open('sgo_slate.json', 'w'))
os.makedirs('snapshots', exist_ok=True)
snap = f"snapshots/sgo_slate_{datetime.datetime.now().strftime('%Y-%m-%d_%H%M')}.json"; json.dump(sl, open(snap, 'w'))
print(len(sl), 'games with props | snapshot saved:', snap)
