# Step 4 (v6.2): run the sim twice and combine.
#  - Marginals (each player's own range) come from a run WITHOUT the stack-correlation settings, so adding
#    correlation doesn't widen anyone's range (ranges were already graded too wide).
#  - Joint behaviour (which sims are big/small for each player) comes from the tuned run
#    (SH_SD=0.6 receiver share competition, TOT_SD=6 shared game-scoring swing, EFF_B=0.6 efficiency link,
#     CS_SD=0.5 carry competition, PF_K=20 game-level pass/rush TD lean, GL_SD=1.0 goal-line role lean).
#  Each player's tuned sims are re-mapped by rank onto his own marginal values.
import subprocess, os, pickle, shutil, numpy as np, pandas as pd
env=dict(os.environ)
subprocess.run(['python3','slate_sim.py'],env=dict(env,SH_SD='0',TOT_SD='0',EFF_B='0',CS_SD='0'),check=True,capture_output=True)
shutil.move('slate_sims.pkl','slate_sims_marg.pkl')
r=subprocess.run(['python3','slate_sim.py'],env=env,check=True,capture_output=True,text=True)
S=pickle.load(open('slate_sims.pkl','rb')); M=pickle.load(open('slate_sims_marg.pkl','rb')); rng=np.random.default_rng(11)
KEEP={'Anytime TDs','Pass TDs'}                     # TD stats keep the tuned run (centering sets their level)
for k,v in S.items():
    if k in M and k[1] not in KEEP:
        order=np.lexsort((rng.random(len(v)),v))     # rank with random tie-breaks
        out=np.empty(len(v),dtype=float); out[order]=np.sort(np.asarray(M[k],dtype=float)); S[k]=out
pickle.dump(S,open('slate_sims.pkl','wb'))
L=pd.read_pickle('slate_legs.pkl')
L['p_more']=[(S[(p,s)]>l).mean() for p,s,l in zip(L['player'],L['stat'],L['line'])]
L['p_less']=[(S[(p,s)]<l).mean() for p,s,l in zip(L['player'],L['stat'],L['line'])]
L['model_median']=[np.median(S[(p,s)]) for p,s in zip(L['player'],L['stat'])]; L['model_mean']=[S[(p,s)].mean() for p,s in zip(L['player'],L['stat'])]
L['best_side']=np.where(L['p_more']>=L['p_less'],'More','Less'); L['best_prob']=L[['p_more','p_less']].max(axis=1)
L.to_pickle('slate_legs.pkl'); print(r.stdout.splitlines()[0]); print('copula step: marginals from base run, joint behaviour from tuned run')
