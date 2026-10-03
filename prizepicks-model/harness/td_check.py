import pandas as pd, numpy as np, pickle, subprocess, os, warnings; warnings.filterwarnings('ignore')
import evaluate as ev
subprocess.run(['python3','slate_sim.py'],env=dict(os.environ,SIM_N='3000',SH_SD='0.6',TOT_SD='6',EFF_B='0.6',CS_SD='0.5',PF_K='20',GL_SD='1.0'),capture_output=True,check=True)
S=pickle.load(open('slate_sims.pkl','rb'))
R=ev.Ro[ev.Ro.stat=='Anytime TDs'].copy(); R['p']=[ (np.asarray(S[(r.player,r.stat)])>0).mean() for r in R.itertuples()]; R['y']=(R.actual>0).astype(float)
R['pos']=R.role.str.replace('_td','').str.replace(r'\d','',regex=True).map({'r':'receiver','rb':'RB'})
# baseline: each player's own prior TD rate this season (games scored / games), shrunk toward his role average
cols=['game_id','season','week','season_type','td_player_id','pass_touchdown','rush_touchdown','posteam','receiver_player_id','rusher_player_id']
d=pd.concat([pd.read_csv(f'../pipeline/pbp_{y}.csv',usecols=cols,low_memory=False) for y in (2024,2025)]); d=d[d.season_type=='REG']; d['t']=d.season*100+d.week
app=pd.concat([d[['game_id','t','season',c]].rename(columns={c:'pid'}) for c in ['receiver_player_id','rusher_player_id']]).dropna().drop_duplicates(['game_id','pid'])
sc=d[(d.pass_touchdown==1)|(d.rush_touchdown==1)].groupby(['game_id','td_player_id']).size()
app['td']=[sc.get((g,p),0)>0 for g,p in zip(app.game_id,app.pid)]; app=app.sort_values('t'); g=app.groupby(['season','pid'])
app['n']=g.cumcount(); app['k']=g.td.cumsum()-app.td
R['pid']=R.player.str.split('|').str[0]; R=R.merge(app[['game_id','pid','n','k']],on=['game_id','pid'],how='left')
role_avg=R.groupby('role').y.transform('mean'); R['own']=(R.k+6*role_avg)/(R.n+6)
ll=lambda p,y:-(y*np.log(np.clip(p,1e-4,1))+(1-y)*np.log(np.clip(1-p,1e-4,1))).mean()
print(f"player-games {len(R)} | actual scoring rate {R.y.mean()*100:.1f}% | model average {R.p.mean()*100:.1f}%")
print(f"log loss (lower = better): model {ll(R.p,R.y):.4f} | own prior TD rate {ll(R.own,R.y):.4f} | role average {ll(role_avg,R.y):.4f}")
print(R.groupby('role').agg(n=('y','size'),model=('p',lambda x:x.mean()*100),actual=('y',lambda x:x.mean()*100)).round(1).to_string())
R['b']=pd.cut(R.p,[0,.1,.2,.3,.4,.5,1],labels=['<10%','10-20%','20-30%','30-40%','40-50%','50%+'])
print(R.groupby('b',observed=True).agg(n=('y','size'),model=('p',lambda x:x.mean()*100),actual=('y',lambda x:x.mean()*100)).round(1).to_string())
