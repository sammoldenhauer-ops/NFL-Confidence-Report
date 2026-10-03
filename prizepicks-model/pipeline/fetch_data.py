# Downloads nflverse play-by-play (2022-2025 + current season as pbp_latest.csv) and player IDs. ~5 min. Cross-platform.
# Usage: python fetch_data.py [current_season]   (default 2026)
import urllib.request, gzip, shutil, sys, os
SEASON = sys.argv[1] if len(sys.argv) > 1 else '2026'
BASE = 'https://github.com/nflverse/nflverse-data/releases/download'
def get(url, out, gz):
    tmp = out + ('.gz' if gz else '.tmp'); urllib.request.urlretrieve(url, tmp)
    if gz:
        with gzip.open(tmp, 'rb') as fi, open(out, 'wb') as fo: shutil.copyfileobj(fi, fo)
        os.remove(tmp)
    else: os.replace(tmp, out)
    print('ok', out)
for yr in (2022, 2023, 2024, 2025): get(f'{BASE}/pbp/play_by_play_{yr}.csv.gz', f'pbp_{yr}.csv', True)
get(f'{BASE}/pbp/play_by_play_{SEASON}.csv.gz', 'pbp_latest.csv', True)
get(f'{BASE}/players/players.csv', 'players.csv', False)
print('done')
