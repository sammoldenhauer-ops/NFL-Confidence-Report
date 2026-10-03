import pandas as pd, numpy as np, warnings; warnings.filterwarnings('ignore')
cols=['game_id','season','week','season_type','posteam','play_type','yardline_100','receiver_player_id','rusher_player_id',
      'pass_touchdown','rush_touchdown','qb_kneel','td_player_id']
d=pd.concat([pd.read_csv(f,usecols=cols,low_memory=False) for f in ['pbp_2025.csv','pbp_latest.csv']])
d=d[d.season_type=='REG'].drop_duplicates(); d['t']=d.season*100+d.week
off=d[d.play_type.isin(['pass','run'])]
P=off[(off.play_type=='pass')&off.receiver_player_id.notna()].assign(pid=lambda x:x.receiver_player_id,z=lambda x:x.yardline_100<=20,kind='rec')
R=off[(off.play_type=='run')&(off.qb_kneel!=1)&off.rusher_player_id.notna()].assign(pid=lambda x:x.rusher_player_id,z=lambda x:x.yardline_100<=5,kind='rush')
def pg(x):   # per player-game counts + team-game totals
    a=x.groupby(['season','t','game_id','posteam','pid']).agg(n=('z','size'),nz=('z','sum')).reset_index()
    b=x.groupby(['game_id','posteam']).agg(N=('z','size'),NZ=('z','sum')).reset_index()
    return a.merge(b,on=['game_id','posteam'])
def prior(a):   # cumulative usage through the previous game, same season+team
    a=a.sort_values('t'); g=a.groupby(['season','posteam','pid'])
    for c in ['n','nz','N','NZ']: a['c_'+c]=g[c].cumsum()-a[c]
    a['games']=g.cumcount(); return a
RP=prior(pg(P)); RU=prior(pg(R))
# team TDs by type per game, and who scored
tt=off.groupby(['game_id','posteam']).agg(RT=('pass_touchdown','sum'),UT=('rush_touchdown','sum')).reset_index()
sc=off[(off.pass_touchdown==1)|(off.rush_touchdown==1)].groupby(['game_id','td_player_id']).size().rename('tds').reset_index().rename(columns={'td_player_id':'pid'})
def evaluate(k_rz,k_gl,sel):
    rp=RP.copy(); ru=RU.copy()
    for x,k in [(rp,k_rz),(ru,k_gl)]:
        x['vol']=x.c_n/x.c_N.clip(lower=1)
        x['zone']=(x.c_nz+k*x.vol*x.c_NZ/x.c_N.clip(lower=1)*0+k*x.vol)/(x.c_NZ+k)   # shrink zone share toward volume share
    m=pd.concat([rp.assign(kind='rec'),ru.assign(kind='rush')]); m=m[(m.games>=3)&sel(m)]
    m=m.merge(tt,on=['game_id','posteam'])
    m['lam_vol']=np.where(m.kind=='rec',m.RT,m.UT)*m.vol; m['lam_zone']=np.where(m.kind=='rec',m.RT,m.UT)*m.zone
    pl=m.groupby(['game_id','posteam','pid'])[['lam_vol','lam_zone']].sum().reset_index().merge(sc,on=['game_id','pid'],how='left').fillna({'tds':0})
    y=(pl.tds>0).astype(float); out={}
    for c in ['lam_vol','lam_zone']:
        p=(1-np.exp(-pl[c])).clip(1e-4,1-1e-4); out[c]=-(y*np.log(p)+(1-y)*np.log(1-p)).mean()
    return out,len(pl)
train=lambda m:(m.season==2025)&(m.t>=202505); test=lambda m:m.season==2026
best=None
for kr in [0,10,20,40,80,160]:
    for kg in [0,5,10,20,40,80]:
        o,n=evaluate(kr,kg,train)
        if best is None or o['lam_zone']<best[0]: best=(o['lam_zone'],kr,kg,o['lam_vol'],n)
print(f"2025 fit: best shrink k_rz={best[1]} k_gl={best[2]} | log loss zone {best[0]:.4f} vs volume-only {best[3]:.4f} (n={best[4]} player-games)")
o,n=evaluate(best[1],best[2],test); print(f"2026 held-out (wks 1-3): zone {o['lam_zone']:.4f} vs volume-only {o['lam_vol']:.4f} (n={n})")
