import pandas as pd, numpy as np, pickle, subprocess, os, sys, json, warnings; warnings.filterwarnings('ignore')
Ro=pd.read_pickle('roles.pkl'); G=pd.read_pickle('slate_games.pkl')
gi=G.set_index('game_id'); Ro['home']=Ro.team.str.split('|').str[0]==Ro.game_id.map(gi.home.str.split('|').str[0])
Ro['spread']=np.where(Ro.home,1,-1)*Ro.game_id.map(gi.home_exp_margin); Ro['imp']=(Ro.game_id.map(gi.total)+Ro.spread)/2
# matchup-adjusted usual-level lines (so they behave like market lines): fit per stat on these games
Y=Ro[Ro.stat.isin(['Pass Yds','Rec Yds','Rush Yds'])].copy(); Y['lr']=np.log((Y.actual+10)/(Y.line0+10))
coef={}
for st,x in Y.groupby('stat'):
    X=np.c_[np.ones(len(x)),np.log(x.imp/22.5),x.spread/10]; b=np.linalg.lstsq(X,x.lr,rcond=None)[0]; coef[st]=b
def adj(r): b=coef[r.stat]; return (r.line0+10)*np.exp(b[0]+b[1]*np.log(r.imp/22.5)+b[2]*r.spread/10)-10
m=Ro.stat.isin(coef); Ro.loc[m,'line']=Ro[m].apply(adj,axis=1); Ro.loc[~m,'line']=0.5
Ro['over']=np.where(Ro.stat=='Anytime TDs',Ro.actual>0,np.where(Ro.stat=='Pass TDs',Ro.actual>=2,Ro.actual>Ro.line))
W=Ro.pivot_table(index=['game_id','team'],columns='role',values='over',aggfunc='first').reset_index()
opp=W[['game_id','team','qb']].rename(columns={'team':'oteam','qb':'oqb'}); W=W.merge(opp,on='game_id'); W=W[W.team!=W.oteam].reset_index(drop=True)
COMBOS={'QB+WR1':['qb','r1'],'QB+WR1+WR2':['qb','r1','r2'],'QB+top3':['qb','r1','r2','r3'],'WR1+WR2':['r1','r2'],'QB+own RB1':['qb','rb1'],
        'QB+opp QB':['qb','oqb'],'QB+WR1+opp QB':['qb','r1','oqb'],'RB1+RB2 rush':['rb1','rb2'],
        'RB1 TD+RB2 TD':['rb1_td','rb2_td'],'RB1 TD+WR1 TD':['rb1_td','r1_td'],'QB2+ TD+WR1 TD':['qb_ptd','r1_td'],'WR1 yds+WR1 TD':['r1','r1_td']}
def emp_lift(Wx,c): A=Wx[c].astype(bool); return A.all(1).mean()/np.prod(A.mean())
rates={r:W[r].astype(bool).mean() for r in set(sum(COMBOS.values(),[]))}
def sim_lifts(env):
    subprocess.run(['python3','slate_sim.py'],env=dict(os.environ,SIM_N='2000',**env),capture_output=True,check=True)
    S=pickle.load(open('slate_sims.pkl','rb')); ind={}
    for r in Ro.itertuples():
        v=S.get((r.player,r.stat))
        if v is None: continue
        if r.stat=='Anytime TDs': ind[(r.game_id,r.team,r.role)]=v>0
        elif r.stat=='Pass TDs': ind[(r.game_id,r.team,r.role)]=v>=2
        else:
            rr=rates[r.role]; ind[(r.game_id,r.team,r.role)]=v>np.quantile(v,1-rr)
    out={}
    for k,c in COMBOS.items():
        pa=[];pm={x:[] for x in c}
        for w in W.itertuples():
            arrs=[]
            for x in c:
                key=(w.game_id,w.oteam,'qb') if x=='oqb' else (w.game_id,w.team,x); arrs.append(ind[key])
            A=np.vstack(arrs); pa.append(A.all(0).mean()); [pm[x].append(a.mean()) for x,a in zip(c,A)]
        out[k]=np.mean(pa)/np.prod([np.mean(pm[x]) for x in c])
    return out
if __name__=='__main__':
    E={k:emp_lift(W,c) for k,c in COMBOS.items()}
    rng=np.random.default_rng(1); gids=W.game_id.unique(); boots={k:[] for k in COMBOS}
    for _ in range(400):
        s=rng.choice(gids,len(gids)); Wb=pd.concat([W[W.game_id==g] for g in s]) if False else W.set_index('game_id').loc[s].reset_index()
        for k,c in COMBOS.items(): boots[k].append(emp_lift(Wb,c))
    CI={k:(np.percentile(v,10),np.percentile(v,90)) for k,v in boots.items()}
    json.dump({'E':E,'CI':CI,'n':len(W)},open('emp.json','w'))
    print(f"team-games {len(W)} | line fit coefs:",{k:np.round(v,2).tolist() for k,v in coef.items()})
    for k in COMBOS: print(f"  {k:16s} actual {E[k]:.2f}  (80% range {CI[k][0]:.2f}-{CI[k][1]:.2f})")
