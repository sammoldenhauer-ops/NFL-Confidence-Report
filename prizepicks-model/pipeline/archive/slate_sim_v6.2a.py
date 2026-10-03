import pandas as pd, numpy as np, json, pickle, warnings; warnings.filterwarnings('ignore')
rng=np.random.default_rng(2026); N=5000
I=pickle.load(open('slate_inputs.pkl','rb')); EF=pickle.load(open('slate_eff.pkl','rb'))
P,base,rdef,F=I['P'],I['base'],I['rdef'],I['flags']; rc,ru,qa=EF['rc'],EF['ru'],EF['qa']
B=pd.read_pickle('board.pkl'); G=pd.read_pickle('slate_games.pkl')
C=json.load(open('gamescript_coefs.json')); D=json.load(open('condisp.json')); SS=json.load(open('share_shift.json')); prm=json.load(open('pass_rec_params.json'))
PO=np.load('outcome_pools.npz'); pools={0:PO['rec_short'],1:PO['rec_mid'],2:PO['rec_deep']}; rp=PO['rush']; pp=np.load('pass_pool.npy')
import os; SH_SD=float(os.environ.get('SH_SD',0.6)); TOT_SD=float(os.environ.get('TOT_SD',10)); EFF_B=float(os.environ.get('EFF_B',0.6))   # tuned Sep 30 vs 2024-25 stack lifts
TD_PTS_SD=float(os.environ.get('TD_PTS_SD',0)); TD_W_YDS=float(os.environ.get('TD_W_YDS',1))
TDP=pickle.load(open('td_params.pkl','rb'))
RZm=TDP['RZ'].set_index(['pid','posteam'])['mult'].to_dict(); GLm=TDP['GL'].set_index(['pid','posteam'])['mult'].to_dict()
LG_YPT={'WR':8.3,'TE':7.1,'RB':5.9}; LG_C=prm['lg_catch']; LG_YPC=rp.mean(); LG_YPA=I['LG_YPA']; LG_TDR=I['LG_TDR']
# redistribute flagged (likely-out) players' shares to teammates proportionally
for team,g in F.groupby('team'):
    for kind,col in [('targets','tgt_share'),('carries','car_share')]:
        out=g[g['kind']==kind]['recent_share'].sum()/100
        if out>0:
            m=(P['team']==team)&P[col].notna(); P.loc[m,col]=P.loc[m,col]/(1-min(out,0.6))
def val(x,d,lo=0.0):
    return float(x) if (x is not None and pd.notna(x) and x>lo) else d
# cap team share totals: named receivers <= 88% of targets, named non-QB rushers <= 90% of carries
qbnames=set(B[B['stat'].isin(['Pass Yds','Pass TDs'])]['player'])
for team in P['team'].unique():
    m=(P['team']==team)&P['tgt_share'].notna()&~P['player'].isin(qbnames); s_=P.loc[m,'tgt_share'].sum()
    if s_>0.88: P.loc[m,'tgt_share']*=0.88/s_
    m=(P['team']==team)&P['car_share'].notna()&~P['player'].isin(qbnames); s_=P.loc[m,'car_share'].sum()
    if s_>0.90: P.loc[m,'car_share']*=0.90/s_
def nb(mu,d): mu=np.maximum(mu,0.2); p=1/d; return rng.negative_binomial(mu*p/(1-p),p)
def comp(c,pool,scale,cap):
    c=np.minimum(c,cap); dr=rng.choice(pool,(N,cap))*scale; return (dr*(np.arange(cap)[None,:]<c[:,None])).sum(1)
def eff_rec(pid,pos):
    h=rc.loc[pid] if pid in rc.index else None; b=LG_YPT.get(pos,7.5)
    ypt=(h['yds']+120*b)/(h['tg']+120) if h is not None else b
    a=(h['air']+960)/(h['tg']+120) if h is not None else 8; tier=0 if a<=6 else (1 if a<=9 else 2)
    c=(h['rec']+120*LG_C.get(pos,.65))/(h['tg']+120) if h is not None else LG_C.get(pos,.65)
    return ypt,tier,c
def alloc(total,weights):
    # hand out each simulated TD to one player, with chance proportional to that sim's weight (volume x zone usage)
    W=np.vstack(weights); W=W/np.maximum(W.sum(0),1e-9); cum=np.cumsum(W,0); out=np.zeros_like(W,dtype=int)
    for j in range(int(total.max()) if len(total) else 0):
        live=total>j; u=rng.random(N); pick=(u[None,:]>cum).sum(0); pick=np.minimum(pick,W.shape[0]-1)
        out[pick[live],np.where(live)[0]]+=1
    return out
SIMS={}; PROJ=[]; TDINT={}
for _,g in G.iterrows():
    mh=g['home_exp_margin']+rng.normal(0,12.4,N)
    tot=g['total']+rng.normal(0,TOT_SD,N)                   # shared scoring environment (shootout vs slog), both teams
    eff=np.maximum(1+EFF_B*(tot-g['total'])/g['total'],0.3)
    for team,opp,exm,marg in [(g['home'],g['away'],g['home_exp_margin'],mh),(g['away'],g['home'],-g['home_exp_margin'],-mh)]:
        b=base.get(team,{'tgts':31,'att':32,'car':26}); sh=marg-exm; V={}
        for c in ['tgts','att','car']:
            k=C[c]; V[c]=np.maximum(b[c]+k['int']+k['exp_margin']*exm+k['shock']*sh+k['total']*(tot-44)+rng.normal(0,k['resid_sd'],N),5)
        T=P[P['team']==team]; stats=B[B['team']==team].groupby('player')['stat'].apply(set).to_dict()
        # receivers split a fixed pie: per-sim share noise, renormalised so the named total stays the same (negative correlation)
        Rn=[r_['player'] for _,r_ in T.iterrows() if not ({'Pass Yds','Pass TDs'}&stats.get(r_['player'],set())) and (stats.get(r_['player'],set())&{'Rec Yds','Receptions','Rush+Rec Yds'} or ('Anytime TDs' in stats.get(r_['player'],set()) and (pd.notna(r_['tgt_share']) or (r_['pos'] or 'WR') in ('WR','TE'))))]
        base_sh={r_['player']:val(r_['tgt_share'],0.03) for _,r_ in T.iterrows() if r_['player'] in Rn}
        zf={p_:np.exp(SH_SD*rng.normal(0,1,N)) for p_ in Rn}; nrm=sum(base_sh[p_]*zf[p_] for p_ in Rn)/max(sum(base_sh.values()),1e-9) if Rn else 1
        tg_sum=np.zeros(N); car_sum=np.zeros(N); rec_yds_sum=np.zeros(N); qb=None; RW={}; UW={}
        for _,r in T.iterrows():
            st=stats.get(r['player'],set()); pid=r['pid']; pos=r['pos'] or 'WR'
            if 'Pass Yds' in st or 'Pass TDs' in st: qb=r; continue
            ry=None; uy=None
            if st & {'Rec Yds','Receptions','Rush+Rec Yds'} or ('Anytime TDs' in st and (pd.notna(r['tgt_share']) or pos in ('WR','TE'))):
                shr=val(r['tgt_share'],0.03)*(zf[r['player']]/nrm if r['player'] in zf else 1)
                ypt,tier,c=eff_rec(pid,pos); t=nb(shr*V['tgts'],D['DR'])
                ry=comp(t,pools[tier],ypt/pools[tier].mean(),25)*eff; rec=rng.binomial(np.minimum(t,25),min(c,0.95))
                tg_sum+=t; rec_yds_sum+=ry; RW[r['player']]=(t*(1-TD_W_YDS)+TD_W_YDS*ry/max(ypt,1))*RZm.get((pid,team),1.0)   # yards-weighted: big games score more
                SIMS[(r['player'],'Rec Yds')]=ry; SIMS[(r['player'],'Receptions')]=rec
                PROJ.append((team,r['player'],'Rec Yds',ry.mean())); PROJ.append((team,r['player'],'Receptions',rec.mean()))
            if st & {'Rush Yds','Rush+Rec Yds'} or ('Anytime TDs' in st and (pd.notna(r['car_share']) or pos=='RB')):
                cs=val(r['car_share'],0.05)
                role='lead' if cs>=0.45 else ('secondary' if cs>=0.15 else 'depth')
                dl=np.array([SS['deltas'][role][l] for l in SS['labels']]); csh=np.clip(cs+dl[np.digitize(marg,SS['bins'][1:-1])],0.01,0.95)
                h=ru.loc[pid] if pid in ru.index else None; ypc=max((h['yds']+150*LG_YPC)/(h['car']+150) if h is not None else LG_YPC,1.5)*rdef.get(opp,1.0)
                ca=nb(csh*V['car'],D['DU']); car_sum+=ca; UW[r['player']]=ca*GLm.get((pid,team),1.0)
                uy=comp(ca,rp,ypc/LG_YPC,40)*eff; SIMS[(r['player'],'Rush Yds')]=uy; PROJ.append((team,r['player'],'Rush Yds',uy.mean()))
            if ry is not None and uy is not None: SIMS[(r['player'],'Rush+Rec Yds')]=ry+uy; PROJ.append((team,r['player'],'Rush+Rec Yds',(ry+uy).mean()))
        if qb is not None:
            pid=qb['pid']; h=qa.loc[pid] if pid in qa.index else None
            ypa=(h['yds']+300*LG_YPA)/(h['att']+300) if h is not None else LG_YPA; tdr=(h['td']+300*LG_TDR)/(h['att']+300) if h is not None else LG_TDR
            ash=val(qb['att_share'],0.97,0.5)
            at=nb(ash*V['att'],D['DQ'])
            other_tg=np.maximum(V['tgts']-tg_sum,0).round().astype(int)          # targets to depth players without lines
            py=rec_yds_sum+comp(other_tg,pools[1],6.2/pools[1].mean(),25)*eff          # attempts beyond targets (throwaways etc.) = 0 yds
            py=py*(ypa/LG_YPA)**0.5                                               # QB's own efficiency, partially (receivers' rates already carry it)
            SIMS[(qb['player'],'Pass Yds')]=py
            PROJ.append((team,qb['player'],'Pass Yds',py.mean()))
            cs=val(qb['car_share'],0.08)
            h2=ru.loc[pid] if pid in ru.index else None; ypc=max((h2['yds']+150*LG_YPC)/(h2['car']+150) if h2 is not None else LG_YPC,1.5)
            qc=nb(cs*V['car'],D['DU']); car_sum+=qc; UW[qb['player']]=qc*GLm.get((pid,team),1.0)
            qr=comp(qc,rp,ypc/LG_YPC,40); SIMS[(qb['player'],'Rush Yds')]=qr; PROJ.append((team,qb['player'],'Rush Yds',qr.mean()))
        # ---- touchdowns (v6.1): team TDs from simulated team points, handed out by volume x red-zone/goal-line usage ----
        pts=np.maximum((tot+marg)/2+rng.normal(0,TD_PTS_SD,N),0); lam=pts*TDP['TDPP']; pf=TDP['team_pf'].get(team,TDP['LG_PF'])   # extra points noise off by default: Poisson TD counts already carry it
        RT=rng.poisson(lam*pf); UT=rng.poisson(lam*(1-pf))
        other_tg=np.maximum(V['tgts']-tg_sum,0); other_car=np.maximum(V['car']-car_sum,0)
        rn=list(RW); un=list(UW)
        ra=alloc(RT,[RW[k] for k in rn]+[other_tg]); ua=alloc(UT,[UW[k] for k in un]+[other_car])
        rws=sum(RW.values())+other_tg; uws=sum(UW.values())+other_car
        if qb is not None:
            SIMS[(qb['player'],'Pass TDs')]=RT                                        # QB pass TDs = team receiving TDs
            PROJ.append((team,qb['player'],'Pass TDs',RT.mean()))
        for nm_ in set(rn)|set(un):
            tds=(ra[rn.index(nm_)] if nm_ in rn else 0)+(ua[un.index(nm_)] if nm_ in un else 0)
            SIMS[(nm_,'Anytime TDs')]=np.asarray(tds)+np.zeros(N,dtype=int)
            TDINT[(nm_,'Anytime TDs')]=(lam*pf*RW[nm_]/np.maximum(rws,1e-9) if nm_ in RW else 0)+(lam*(1-pf)*UW[nm_]/np.maximum(uws,1e-9) if nm_ in UW else 0)
            PROJ.append((team,nm_,'Anytime TDs',(SIMS[(nm_,'Anytime TDs')]>0).mean()))
pickle.dump(SIMS,open('slate_sims.pkl','wb')); pickle.dump(TDINT,open('slate_td_intensity.pkl','wb'))
# ---- legs ----
L=B.copy(); L['game']=L['away']+' @ '+L['home']
L['p_more']=[(SIMS[(p,s)]>l).mean() if (p,s) in SIMS else np.nan for p,s,l in zip(L['player'],L['stat'],L['line'])]
L['p_less']=[(SIMS[(p,s)]<l).mean() if (p,s) in SIMS else np.nan for p,s,l in zip(L['player'],L['stat'],L['line'])]
L['model_median']=[np.median(SIMS[(p,s)]) if (p,s) in SIMS else np.nan for p,s in zip(L['player'],L['stat'])]
L['model_mean']=[SIMS[(p,s)].mean() if (p,s) in SIMS else np.nan for p,s in zip(L['player'],L['stat'])]
L=L.dropna(subset=['p_more']); L['best_side']=np.where(L['p_more']>=L['p_less'],'More','Less'); L['best_prob']=L[['p_more','p_less']].max(axis=1)
L.to_pickle('slate_legs.pkl')
print(f"simulated player-stats: {len(SIMS)} | legs priced: {len(L)} of {len(B)}")
print(f"median model-vs-line gap (model median - line): {(L['model_median']-L['line']).median():+.1f} | share of legs where model picks More: {(L['best_side']=='More').mean()*100:.0f}%")
print(L.groupby('stat').apply(lambda d:pd.Series({'n':len(d),'avg_model_minus_line':(d['model_mean']-d['line']).mean(),'pct_more':(d['best_side']=='More').mean()*100})).round(1))
