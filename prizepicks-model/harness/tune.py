import numpy as np, pickle, subprocess, os, itertools, json, pandas as pd
import evaluate as ev
E=json.load(open('emp.json')); CI=E['CI']
gids=np.array(sorted(ev.W.game_id.unique())); rng=np.random.default_rng(3); rng.shuffle(gids); A=set(gids[:len(gids)//2]); Bh=set(gids[len(gids)//2:])
def parts(env):
    subprocess.run(['python3','slate_sim.py'],env=dict(os.environ,SIM_N='2000',**env),capture_output=True,check=True)
    S=pickle.load(open('slate_sims.pkl','rb')); ind={}
    for r in ev.Ro.itertuples():
        v=S.get((r.player,r.stat))
        if v is None: continue
        ind[(r.game_id,r.team,r.role)]=(v>0) if r.stat=='Anytime TDs' else ((v>=2) if r.stat=='Pass TDs' else v>np.quantile(v,1-ev.rates[r.role]))
    rows=[]
    for w in ev.W.itertuples():
        d={'game_id':w.game_id}
        for k,c in ev.COMBOS.items():
            M=np.vstack([ind[(w.game_id,w.oteam,'qb')] if x=='oqb' else ind[(w.game_id,w.team,x)] for x in c])
            d[k+'|all']=M.all(0).mean()
            for x,a in zip(c,M): d[k+'|'+x]=a.mean()
        rows.append(d)
    return pd.DataFrame(rows)
def lifts(D,games):
    D=D[D.game_id.isin(games)]; return {k:D[k+'|all'].mean()/np.prod([D[k+'|'+x].mean() for x in c]) for k,c in ev.COMBOS.items()}
def emp(games):
    Wx=ev.W[ev.W.game_id.isin(games)]; return {k:ev.emp_lift(Wx,c) for k,c in ev.COMBOS.items()}
def loss(l,e): return np.mean([((np.log(l[k])-np.log(e[k]))/max(np.log(CI[k][1]/CI[k][0])/2.56,0.02))**2 for k in ev.COMBOS])
EA,EB,EALL=emp(A),emp(Bh),emp(set(gids))
if __name__=='__main__':
    res=[]
    grid=list(itertools.product([0.6,1.0],[6,10],[0.3,0.6],[8,20],[1.0,2.0]))
    for sh,ts,eb,pk,gl in grid:
        env=dict(SH_SD=str(sh),TOT_SD=str(ts),EFF_B=str(eb),CS_SD='0.5',PF_K=str(pk),GL_SD=str(gl))
        D=parts(env); la,lb=lifts(D,A),lifts(D,Bh); res.append(dict(sh=sh,ts=ts,eb=eb,pk=pk,gl=gl,trainA=loss(la,EA),testB=loss(lb,EB),D=D))
        print(f"SH={sh} TOT={ts} EFF={eb} PF_K={pk} GL={gl} | fit half {res[-1]['trainA']:.2f} | held-out half {res[-1]['testB']:.2f}",flush=True)
    pickle.dump(res,open('tune_res.pkl','wb'))
    b=min(res,key=lambda r:r['trainA']); print('\nPICKED ON FIT HALF:',{k:b[k] for k in ['sh','ts','eb','pk','gl']},'| held-out error',round(b['testB'],2))
    base=parts(dict(SH_SD='0.6',TOT_SD='10',EFF_B='0.6',CS_SD='0.5',PF_K='20',GL_SD='2.0')); print('v6.2 current on held-out half:',round(loss(lifts(base,Bh),EB),2))
    off=parts(dict(SH_SD='0',TOT_SD='0',EFF_B='0',CS_SD='0',PF_K='0',GL_SD='0')); print('no tuning on held-out half:',round(loss(lifts(off,Bh),EB),2))
