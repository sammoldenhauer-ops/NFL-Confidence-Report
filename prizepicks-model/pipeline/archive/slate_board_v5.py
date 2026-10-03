import json, pandas as pd, re
ev=json.load(open('sgo_slate.json')); ev=[e for e in ev if any(o.get('playerID') for o in (e.get('odds') or {}).values())]
STATS={'passing_yards':'Pass Yds','passing_touchdowns':'Pass TDs','rushing_yards':'Rush Yds','receiving_yards':'Rec Yds','receiving_receptions':'Receptions','rushing+receiving_yards':'Rush+Rec Yds'}
rows=[]; games=[]
for e in ev:
    t=e['teams']; h=t['home']['names']['short']; a=t['away']['names']['short']; tid={t['home']['teamID']:h,t['away']['teamID']:a}
    o=e['odds']; sp=o.get('points-home-game-sp-home',{}); tot=o.get('points-all-game-ou-over',{})
    home_margin=-float(sp.get('fairSpread') or sp.get('bookSpread'))
    games.append({'event':e['eventID'],'home':h,'away':a,'start':e['status']['startsAt'],'home_exp_margin':home_margin,'total':float(tot.get('fairOverUnder') or tot.get('bookOverUnder'))})
    for oid,x in o.items():
        if not x.get('playerID') or x.get('periodID')!='game' or x.get('betTypeID')!='ou' or x.get('sideID')!='over' or x.get('statID') not in STATS: continue
        if x.get('bookOverUnder') is None: continue
        p=e['players'].get(x['playerID'],{})
        rows.append({'event':e['eventID'],'home':h,'away':a,'player':p.get('name'),'team':tid.get(p.get('teamID')),'stat':STATS[x['statID']],
                     'line':float(x['bookOverUnder']),'fair':float(x.get('fairOverUnder') or x['bookOverUnder'])})
B=pd.DataFrame(rows).drop_duplicates(['event','player','stat']); G=pd.DataFrame(games)
B.to_pickle('board.pkl'); G.to_pickle('slate_games.pkl')
print(G[['start','away','home','home_exp_margin','total']].to_string(index=False))
print("\nlines by stat:",B['stat'].value_counts().to_dict(),"| players:",B['player'].nunique(),"| missing team:",B['team'].isna().sum())
