import pandas as pd, numpy as np, pickle, warnings; warnings.filterwarnings('ignore')
d=pd.read_csv('pbp_wk4.csv',low_memory=False); d=d[(d['week']==3)&(d['game_id']!='2026_03_ATL_GB')]
pas=d[d['play_type']=='pass']; run=d[(d['play_type']=='run')]
att=pas[(pas['pass_attempt']==1)&(pas['sack']!=1)&pas['passer_player_id'].notna()]
box=pd.concat([att.groupby('passer_player_id').agg(py=('passing_yards',lambda s:s.fillna(0).sum()),ptd=('pass_touchdown','sum')),
               run[run['rusher_player_id'].notna()].groupby('rusher_player_id').agg(ry=('rushing_yards',lambda s:s.fillna(0).sum())),
               pas[pas['receiver_player_id'].notna()].groupby('receiver_player_id').agg(rcy=('receiving_yards',lambda s:s.fillna(0).sum()),rec=('complete_pass','sum'),tg=('complete_pass','size'))],axis=1).fillna(0)
snaps_any=set(box.index)
I=pickle.load(open('slate_inputs.pkl','rb')); P=I['P'].set_index('player')
def actual(player,stat):
    pid=P['pid'].get(player)
    if pid not in box.index: return None
    b=box.loc[pid]
    return {'Pass Yds':b['py'],'Pass TDs':b['ptd'],'Rush Yds':b['ry'],'Rec Yds':b['rcy'],'Receptions':b['rec'],'Rush+Rec Yds':b['ry']+b['rcy']}[stat]
SC=pickle.load(open('slate_sims_centered.pkl','rb')); RAW=pickle.load(open('slate_sims.pkl','rb')); L=pd.read_pickle('slate_legs_final.pkl')
rows=[]
for x in L.itertuples():
    a=actual(x.player,x.stat)
    if a is None: rows.append({'player':x.player,'team':x.team,'stat':x.stat,'played':False}); continue
    s=SC[(x.player,x.stat)]; r=RAW[(x.player,x.stat)]
    pit=((s<a).mean()+0.5*(s==a).mean()); pitr=((r<a).mean()+0.5*(r==a).mean())
    rows.append({'player':x.player,'team':x.team,'game':f"{x.away} @ {x.home}",'stat':x.stat,'played':True,'market_line':x.line,'actual':a,
                 'p_more_mkt':x.p_more,'more_hit':a>x.line,'push':a==x.line,
                 'pct':pit*100,'in50':np.percentile(s,25)<=a<=np.percentile(s,75),'in80':np.percentile(s,10)<=a<=np.percentile(s,90),
                 'pct_raw':pitr*100,'in50_raw':np.percentile(r,25)<=a<=np.percentile(r,75),'in80_raw':np.percentile(r,10)<=a<=np.percentile(r,90),
                 'raw_median':np.median(r)})
Gd=pd.DataFrame(rows); Gd.to_pickle('sun_graded.pkl')
pl=Gd[Gd['played']]; dnp=Gd[~Gd['played']].drop_duplicates('player')
print(f"player-stats graded: {len(pl)} | players with lines but no recorded stats: {dnp['player'].nunique()}")
print("  ",", ".join(f"{p} ({t})" for p,t in zip(dnp['player'],dnp['team'])))
print(f"\n{'':30s}{'market-centered':>17}{'raw model':>11}  target")
print(f"{'In middle 50% of range':30s}{pl['in50'].mean()*100:>16.1f}%{pl['in50_raw'].mean()*100:>10.1f}%   50%")
print(f"{'In middle 80% of range':30s}{pl['in80'].mean()*100:>16.1f}%{pl['in80_raw'].mean()*100:>10.1f}%   80%")
print(f"{'Above 90th pct':30s}{(pl['pct']>90).mean()*100:>16.1f}%{(pl['pct_raw']>90).mean()*100:>10.1f}%   10%")
print(f"{'Below 10th pct':30s}{(pl['pct']<10).mean()*100:>16.1f}%{(pl['pct_raw']<10).mean()*100:>10.1f}%   10%")
print(f"{'Median landing spot':30s}{pl['pct'].median():>16.0f} {pl['pct_raw'].median():>10.0f}    50")
m=pl[~pl['push']]
print(f"\nAt the market line: More hit {m['more_hit'].mean()*100:.1f}% of the time (n={len(m)}); avg predicted P(More) {m['p_more_mkt'].mean()*100:.1f}%")
print("by stat (More hit rate / predicted):")
print(m.groupby('stat').apply(lambda g:f"{g['more_hit'].mean()*100:.0f}% / {g['p_more_mkt'].mean()*100:.0f}% (n={len(g)})").to_string())
