# Empirical multi-leg "lift" (P(all over) / product of each leg's own over rate) from 2024-25 games,
# using each player's pre-game usual level (mean of prior same-season games with the team) as the line.
import pandas as pd, numpy as np, warnings; warnings.filterwarnings('ignore')
cols=['game_id','season','week','season_type','posteam','defteam','play_type','passer_player_id','receiver_player_id','rusher_player_id',
      'yards_gained','complete_pass','qb_kneel','sack','pass_attempt']
d=pd.concat([pd.read_csv(f,usecols=cols,low_memory=False) for f in ['pbp_2024.csv','pbp_2025.csv']]); d=d[d.season_type=='REG']; d['t']=d.season*100+d.week
off=d[d.play_type.isin(['pass','run'])]
pas=off[(off.play_type=='pass')&(off.sack!=1)&off.passer_player_id.notna()]
qb=pas.groupby(['season','t','game_id','posteam','passer_player_id']).agg(att=('pass_attempt','sum'),y=('yards_gained',lambda x:0)).reset_index()
qb['y']=pas[pas.complete_pass==1].groupby(['game_id','passer_player_id']).yards_gained.sum().reindex(list(zip(qb.game_id,qb.passer_player_id))).fillna(0).values
qb=qb[qb.att>=15].sort_values('att').groupby(['game_id','posteam']).tail(1).rename(columns={'passer_player_id':'pid'})
rc=off[(off.play_type=='pass')&off.receiver_player_id.notna()]
rec=rc.groupby(['season','t','game_id','posteam','receiver_player_id']).agg(tg=('yards_gained','size')).reset_index().rename(columns={'receiver_player_id':'pid'})
rec['y']=rc[rc.complete_pass==1].groupby(['game_id','receiver_player_id']).yards_gained.sum().reindex(list(zip(rec.game_id,rec.pid))).fillna(0).values
rs=off[(off.play_type=='run')&(off.qb_kneel!=1)&off.rusher_player_id.notna()]
ru=rs.groupby(['season','t','game_id','posteam','rusher_player_id']).agg(car=('yards_gained','size'),y=('yards_gained','sum')).reset_index().rename(columns={'rusher_player_id':'pid'})
def prior(x,vol):   # pre-game usual level + usage, from prior games same season & team (need 4+)
    x=x.sort_values('t'); g=x.groupby(['season','posteam','pid'])
    x['n']=g.cumcount(); x['line']=(g.y.cumsum()-x.y)/x.n.replace(0,np.nan); x['use']=(g[vol].cumsum()-x[vol])/x.n.replace(0,np.nan)
    x=x[x.n>=4].copy(); x['over']=x.y>x.line; return x
QB=prior(qb,'att'); RC=prior(rec,'tg'); RU=prior(ru,'car')
RC['rk']=RC.groupby(['game_id','posteam']).use.rank(ascending=False,method='first'); RU['rk']=RU.groupby(['game_id','posteam']).use.rank(ascending=False,method='first')
W=QB[['game_id','posteam','defteam' if 'defteam' in QB else 'posteam','over']].rename(columns={'over':'qb'}) if False else QB[['game_id','posteam','over']].rename(columns={'over':'qb'})
for k in (1,2,3): W=W.merge(RC[RC.rk==k][['game_id','posteam','over']].rename(columns={'over':f'r{k}'}),on=['game_id','posteam'],how='left')
W=W.merge(RU[RU.rk==1][['game_id','posteam','over']].rename(columns={'over':'rb1'}),on=['game_id','posteam'],how='left')
opp=W[['game_id','posteam','qb','rb1']].rename(columns={'posteam':'opp','qb':'oqb','rb1':'orb1'})
W=W.merge(opp,on='game_id'); W=W[W.posteam!=W.opp]
def lift(cols):
    x=W.dropna(subset=cols); A=x[cols].astype(bool); return A.all(1).mean()/np.prod(A.mean()), len(x), A.mean().round(2).tolist()
TESTS={'QB + WR1':['qb','r1'],'QB + WR1 + WR2':['qb','r1','r2'],'QB + top 3 receivers':['qb','r1','r2','r3'],'WR1 + WR2 (no QB)':['r1','r2'],
       'QB + own RB1 rush':['qb','rb1'],'QB + opposing QB':['qb','oqb'],'QB + WR1 + opposing QB':['qb','r1','oqb']}
if __name__=='__main__':
    for k,c in TESTS.items():
        l,n,m=lift(c); print(f'{k:24s} lift {l:.2f}  (n={n}, each leg over rate {m})')
