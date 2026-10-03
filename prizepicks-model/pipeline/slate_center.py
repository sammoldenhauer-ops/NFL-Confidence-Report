import pandas as pd, numpy as np, pickle
S=pickle.load(open('slate_sims.pkl','rb')); L=pd.read_pickle('slate_legs.pkl'); rng=np.random.default_rng(7)
COUNT={'Receptions','Pass TDs'}; SC={}
import os as _o; _w=float(_o.environ.get('WIDTH_YDS',0.95)); YDS_W={k:_w for k in ('Pass Yds','Rec Yds','Rush Yds','Rush+Rec Yds')}
import os; TDI=pickle.load(open('slate_td_intensity.pkl','rb')) if os.path.exists('slate_td_intensity.pkl') else {}
def center_td(cnt,lam,tgt):
    # Anytime TD: scaling can't create a TD where the sim has none, so thin or boost instead (keeps the link to team scoring):
    # too high -> each simulated TD survives with prob (1-q); too low -> add Poisson(c x that sim's TD intensity) extra TDs.
    cnt=cnt.astype(int); cur=(cnt>0).mean()
    if abs(cur-tgt)<1e-4: return cnt
    if cur>tgt:
        lo,hi=0.0,1.0
        for _ in range(40):
            q=(lo+hi)/2; pm=(1-q**cnt)[cnt>0].sum()/len(cnt)
            if pm>tgt: lo=q
            else: hi=q
        return rng.binomial(cnt,1-(lo+hi)/2)
    lam=np.maximum(np.asarray(lam,dtype=float),1e-6); lo,hi=0.0,50.0
    for _ in range(50):
        c=(lo+hi)/2; pm=1-((cnt==0)*np.exp(-c*lam)).mean()
        if pm<tgt: lo=c
        else: hi=c
    return cnt+rng.poisson((lo+hi)/2*lam)
U=rng.random(5000)
for (p,s),x in S.items():
    row=L[(L['player']==p)&(L['stat']==s)]
    if row.empty: continue
    if s=='Anytime TDs':
        SC[(p,s)]=center_td(x,TDI.get((p,s),np.full(len(x),0.3)),float(row['book_p_over'].iloc[0])); continue
    x=x.astype(float)
    # v6 centering: match the market's no-vig P(over) at the BOOK line (half-point, so no pushes).
    # v5 treated SGO's fairOverUnder as a 50/50 median, but SGO pairs it with its own fairOdds, so every
    # center sat too high (e.g. Hurts: fair 224.5 was only 42% over; book 218.5 was 50/50). Fixed 2026-09-29.
    bp=row['book_p_over'].iloc[0] if 'book_p_over' in row else None
    if bp is not None and pd.notna(bp): ref,tgt=row['line'].iloc[0],float(bp)
    else: ref,tgt=row['fair'].iloc[0],0.5            # fallback: old behaviour when odds are missing
    def trans(k): return np.floor(k*x+U) if s in COUNT else k*x
    lo,hi=0.05,20.0
    for _ in range(40):                      # find k so P(sim > ref line) = market's no-vig P(over)
        k=(lo*hi)**0.5; pm=(trans(k)>ref).mean()
        if pm<tgt: lo=k
        else: hi=k
    SC[(p,s)]=trans((lo*hi)**0.5)
    if s in YDS_W:   # v6.3 width: yardage ranges 5% narrower around the book line (keeps the line's %). Week 3 Sunday book
        ln=float(row['line'].iloc[0]); SC[(p,s)]=ln+YDS_W[s]*(SC[(p,s)]-ln)   # lines, leave-one-game-out: gap 1.84 -> 1.48
pickle.dump(SC,open('slate_sims_centered.pkl','wb'))
L['p_more']=[(SC[(p,s)]>l).mean() for p,s,l in zip(L['player'],L['stat'],L['line'])]
L['p_less']=[(SC[(p,s)]<l).mean() for p,s,l in zip(L['player'],L['stat'],L['line'])]
L['best_side']=np.where(L['p_more']>=L['p_less'],'More','Less'); L['best_prob']=L[['p_more','p_less']].max(axis=1)
L.to_pickle('slate_legs_centered.pkl')
print("single legs now:",L['best_prob'].describe()[['mean','min','max']].round(3).to_dict())
