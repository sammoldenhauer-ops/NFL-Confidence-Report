import pandas as pd, numpy as np, pickle
S=pickle.load(open('slate_sims.pkl','rb')); L=pd.read_pickle('slate_legs.pkl'); rng=np.random.default_rng(7)
COUNT={'Receptions','Pass TDs'}; SC={}
U=rng.random(5000)
for (p,s),x in S.items():
    row=L[(L['player']==p)&(L['stat']==s)]
    if row.empty: continue
    fair=row['fair'].iloc[0]; x=x.astype(float)
    def trans(k): return np.floor(k*x+U) if s in COUNT else k*x
    lo,hi=0.05,20.0
    for _ in range(40):                      # find k so the market fair line is the median
        k=(lo*hi)**0.5; pm=(trans(k)>fair).mean()
        if pm<0.5: lo=k
        else: hi=k
    SC[(p,s)]=trans((lo*hi)**0.5)
pickle.dump(SC,open('slate_sims_centered.pkl','wb'))
L['p_more']=[(SC[(p,s)]>l).mean() for p,s,l in zip(L['player'],L['stat'],L['line'])]
L['p_less']=[(SC[(p,s)]<l).mean() for p,s,l in zip(L['player'],L['stat'],L['line'])]
L['best_side']=np.where(L['p_more']>=L['p_less'],'More','Less'); L['best_prob']=L[['p_more','p_less']].max(axis=1)
L.to_pickle('slate_legs_centered.pkl')
print("single legs now:",L['best_prob'].describe()[['mean','min','max']].round(3).to_dict())
