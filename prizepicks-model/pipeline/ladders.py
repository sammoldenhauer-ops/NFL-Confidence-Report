import pandas as pd, numpy as np, pickle
S=pickle.load(open('slate_sims_centered.pkl','rb')); L=pd.read_pickle('slate_legs_final.pkl'); G=pd.read_pickle('slate_games.pkl')
ko=(pd.to_datetime(G.set_index('event')['start'])-pd.Timedelta(hours=4)).dt.strftime('%a %I:%M %p ET').to_dict()
STEP={'Pass Yds':10,'Pass TDs':1,'Receptions':1}
def bucket(p):
    for lo,lab in [(90,'90%+'),(80,'80-89%'),(70,'70-79%'),(60,'60-69%'),(55,'55-59%'),(50,'50-54%')]:
        if p>=lo: return lab
    return '<50%'
rows=[]; summ=[]
for x in L.itertuples():
    s=S[(x.player,x.stat)]; step=STEP.get(x.stat,5 if x.line>=25 else 2)
    game=f"{x.away} @ {x.home}"
    lines=sorted({round(x.line+k*step,1) for k in range(-10,11) if x.line+k*step>0})
    for ln in lines:
        pm=(s>ln).mean()*100; pl=(s<ln).mean()*100
        side,conf=('More',pm) if pm>=pl else ('Less',pl)
        if conf>97 or conf<50: continue
        rows.append({'Player':x.player,'Team':x.team,'Game':game,'Kickoff':ko.get(x.event,''),'Stat':x.stat,'Pick':side,'Line':ln,
                     'Confidence':round(conf/100,3),'Bucket':bucket(conf),'Market line':x.line,'At market line':'Yes' if abs(ln-x.line)<1e-6 else ''})
    def best_line(side,th):
        ok=[ln for ln in lines if ((s>ln).mean() if side=='More' else (s<ln).mean())>=th]
        return (max(ok) if side=='More' else min(ok)) if ok else None
    summ.append({'Player':x.player,'Team':x.team,'Game':game,'Kickoff':ko.get(x.event,''),'Stat':x.stat,'Market line':x.line,
                 'Median outcome':float(np.median(s)),'P(More) at market':round((s>x.line).mean(),3),'P(Less) at market':round((s<x.line).mean(),3),
                 'More 60%+ up to':best_line('More',.6),'More 70%+ up to':best_line('More',.7),'More 80%+ up to':best_line('More',.8),
                 'Less 60%+ down to':best_line('Less',.6),'Less 70%+ down to':best_line('Less',.7),'Less 80%+ down to':best_line('Less',.8)})
R=pd.DataFrame(rows); SM=pd.DataFrame(summ)
R.to_pickle('ladder_rows.pkl'); SM.to_pickle('ladder_summary.pkl')
print(f"ladder rows: {len(R)} | player-stats: {len(SM)} | players: {SM['Player'].nunique()}")
print(R['Bucket'].value_counts().reindex(['90%+','80-89%','70-79%','60-69%','55-59%','50-54%']).to_string())
print(R[R['Player']=='Keenan Allen'][['Stat','Pick','Line','Confidence','Bucket','At market line']].to_string(index=False))
