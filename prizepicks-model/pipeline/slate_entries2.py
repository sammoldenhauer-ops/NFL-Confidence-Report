import pandas as pd, numpy as np, pickle
S=pickle.load(open('slate_sims_centered.pkl','rb')); L=pd.read_pickle('slate_legs_centered.pkl')
PAY={2:{'power':3},3:{'power':5,'flex':{3:2.25,2:1.25}},4:{'power':10,'flex':{4:5,3:1.5}},5:{'power':20,'flex':{5:10,4:2,3:0.4}},6:{'power':37.5,'flex':{6:25,5:2,4:0.4}}}
# drop legs whose distribution couldn't be centered on the market (degenerate sims)
L['p_more_fair']=[(S[(p,s)]>f).mean() for p,s,f in zip(L['player'],L['stat'],L['fair'])]
tgt=L['book_p_over'].where(L['book_p_over'].notna(),0.5) if 'book_p_over' in L else 0.5   # v6: centering target
ref=np.where(L['book_p_over'].notna(),L['p_more'],L['p_more_fair']) if 'book_p_over' in L else L['p_more_fair']
bad=L[(ref-tgt).abs()>0.08]; L=L.drop(bad.index)
print(f"legs dropped (couldn't center): {len(bad)} | usable legs: {len(L)}")
C=pd.concat([L.assign(side='More',prob=L['p_more']),L.assign(side='Less',prob=L['p_less'])]).reset_index(drop=True)
C=C[(C['prob']>=0.45)&(C['p_more'].between(0.40,0.60))].reset_index(drop=True)
C=C[~((C['stat']=='Anytime TDs')&(C['side']=='Less'))].reset_index(drop=True)   # PrizePicks TD props are More-only
H=np.array([(S[(p,s)]>l) if sd=='More' else (S[(p,s)]<l) for p,s,l,sd in zip(C['player'],C['stat'],C['line'],C['side'])],dtype=np.float32)
Nsim=H.shape[1]; pl=C['player'].values; tm=C['team'].values; gm=C['event'].values
pair=(H@H.T)/Nsim
iu=np.triu_indices(len(C),1); vals=pair[iu]
okm=(pl[iu[0]]!=pl[iu[1]])&(tm[iu[0]]!=tm[iu[1]])|((pl[iu[0]]!=pl[iu[1]])&(gm[iu[0]]==gm[iu[1]])&(tm[iu[0]]!=tm[iu[1]]))
# allow same-team pairs too, as long as a 3rd+ leg adds another team later; for 2-leg entries require 2 teams
two_ok=(pl[iu[0]]!=pl[iu[1]])&(tm[iu[0]]!=tm[iu[1]])
# v6.3 combo corrections (harness_tools, 412 historical team-games): the sim still overrates two same-team stacks.
#  QB Pass Yds More + 2 of his receivers' yardage/catch overs: actual lift 1.33 vs sim 1.40 -> x0.95
#  QB Pass Yds More + 3+ of his receivers:                     actual 1.34 vs sim 1.49     -> x0.90
#  QB Pass TDs More + one of his receivers' Anytime TD More:   actual 1.53 vs sim 1.70     -> x0.90
REC={'Rec Yds','Receptions','Rush+Rec Yds'}
def corr(c):
    x=C.loc[list(c)]; f=1.0
    for team,g in x.groupby('team'):
        qt=((g['stat']=='Pass TDs')&(g['side']=='More')).any(); ntd=((g['stat']=='Anytime TDs')&(g['side']=='More')).sum()
        for side in ('More','Less'):   # QB + his receivers all over, or all under: same correlation, same overrating
            qy=((g['stat']=='Pass Yds')&(g['side']==side)).any(); nrec=((g['stat'].isin(REC))&(g['side']==side)).sum()
            if qy and nrec>=3: f*=0.90
            elif qy and nrec==2: f*=0.95
        if qt and ntd>=1: f*=0.90
    return f
order=np.argsort(-vals)
results={}
top2=[(tuple(sorted((iu[0][k],iu[1][k]))),vals[k]) for k in order if two_ok[k]][:300]
results[2]=sorted([(c,v*corr(c)) for c,v in top2],key=lambda x:-x[1])
# seed beam for larger sizes with best pairs regardless of team (same-team stacks are the point)
seed=[(tuple(sorted((iu[0][k],iu[1][k]))),vals[k]) for k in order if pl[iu[0][k]]!=pl[iu[1][k]]][:300]
beam=[c for c,_ in seed]
for size in range(3,7):
    HB=np.array([H[list(c)].prod(0) for c in beam],dtype=np.float32)
    J=(HB@H.T)/Nsim
    cand={}
    for bi,c in enumerate(beam):
        used=set(pl[list(c)])
        for j in np.argsort(-J[bi])[:60]:
            if pl[j] in used or j in c: continue
            nc=tuple(sorted(c+(j,)))
            if len(set(tm[list(nc)]))<2: continue
            cand[nc]=J[bi,j]*corr(nc)
    ranked=sorted(cand.items(),key=lambda x:-x[1])[:300]; results[size]=ranked; beam=[c for c,_ in ranked]
rows=[]
for size,rk in results.items():
    chosen=[]
    for c,pj in rk:
        if any(len(set(c)&set(x))>max(1,size-2) for x in chosen): continue
        chosen.append(c); hits=H[list(c)].sum(0); pk={k:(hits==k).mean() for k in range(size+1)}
        indep=float(np.prod(C.loc[list(c),'prob'].values))
        legs=C.loc[list(c)]
        rows.append({'size':size,'legs':[f"{r.player} ({r.team}) {r.stat} {r.side} {r.line:g}" for r in legs.itertuples()],
                     'leg_probs':[round(v*100,1) for v in legs['prob']],'games':legs['event'].nunique(),
                     'p_all':float(pj),'combo_corr':corr(c),'p_miss1':pk.get(size-1,0),'p_miss2':pk.get(size-2,0),'indep':indep,
                     'ev_power':float(pj)*PAY[size]['power']-1,
                     'ev_flex':(sum(pk[k]*m for k,m in PAY[size]['flex'].items())-1) if 'flex' in PAY[size] else np.nan})
        if len(chosen)==10: break
E=pd.DataFrame(rows); E.to_pickle('slate_entries.pkl'); L.to_pickle('slate_legs_final.pkl')
for size in range(2,7):
    e=E[E['size']==size].sort_values('p_all',ascending=False).iloc[0]
    print(f"\nBest {size}-leg: all hit {e['p_all']*100:.1f}% vs {e['indep']*100:.1f}% if independent | break-even {100/PAY[size]['power']:.1f}% | Power EV {e['ev_power']*100:+.0f}%"+(f" | Flex EV {e['ev_flex']*100:+.0f}%" if pd.notna(e['ev_flex']) else ''))
    for l,p in zip(e['legs'],e['leg_probs']): print(f"    {l}  [{p}%]")
