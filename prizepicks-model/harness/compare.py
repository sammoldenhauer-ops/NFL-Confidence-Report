import json, numpy as np, sys
from evaluate import sim_lifts, COMBOS
E=json.load(open('emp.json')); CI=E['CI']; EM=E['E']
def loss(l):   # squared log error, each combo scaled by its own noise range
    return np.mean([((np.log(l[k])-np.log(EM[k]))/max(np.log(CI[k][1]/CI[k][0])/2.56,0.02))**2 for k in COMBOS])
if __name__=='__main__':
    cfgs={'v6.1 (no tuning)':dict(SH_SD='0',TOT_SD='0',EFF_B='0',CS_SD='0',PF_K='0',GL_SD='0'),'v6.2 (Monday-tuned)':{}}
    R={n:sim_lifts(e) for n,e in cfgs.items()}
    print(f"{'combo':16s} {'actual (80% range)':20s} "+' '.join(f'{n:>20s}' for n in R))
    for k in COMBOS: print(f"{k:16s} {EM[k]:.2f} ({CI[k][0]:.2f}-{CI[k][1]:.2f})    "+' '.join(f'{R[n][k]:>20.2f}' for n in R))
    print('noise-scaled error:',{n:round(loss(l),2) for n,l in R.items()})
