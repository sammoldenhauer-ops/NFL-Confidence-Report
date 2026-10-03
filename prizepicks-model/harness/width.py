# Range-width test: are the model's ranges the right width around a market-like center?
import pandas as pd, numpy as np, pickle, subprocess, os, warnings; warnings.filterwarnings('ignore')
import evaluate as ev
subprocess.run(['python3','slate_sim.py'],env=dict(os.environ,SIM_N='3000',SH_SD='0',TOT_SD='0',EFF_B='0',CS_SD='0'),capture_output=True,check=True)
S=pickle.load(open('slate_sims.pkl','rb')); rng=np.random.default_rng(7); rows=[]
for r in ev.Ro[ev.Ro.stat.isin(['Pass Yds','Rec Yds','Rush Yds'])].itertuples():
    v=np.asarray(S.get((r.player,r.stat)),dtype=float)
    if v is None or len(v)==0: continue
    line=max(r.line,1.0); m=np.median(v)
    if m<=0: continue
    c=v*(line/m)                                   # same move the live pipeline makes: scale so the line is the 50/50 point
    lo=(c<r.actual).mean(); hi=(c<=r.actual).mean(); pit=lo+rng.random()*(hi-lo)
    rows.append({'stat':r.stat,'role':r.role,'line':line,'actual':r.actual,'pit':pit,
                 'model_mad':np.mean(np.abs(c-line)),'act_dev':abs(r.actual-line)})
X=pd.DataFrame(rows); X.to_pickle('width_rows.pkl')
def summ(x): return pd.Series({'n':len(x),'in middle 50%':((x.pit>.25)&(x.pit<.75)).mean()*100,'in middle 80%':((x.pit>.1)&(x.pit<.9)).mean()*100,
                               'below 25th':(x.pit<.25).mean()*100,'above 75th':(x.pit>.75).mean()*100,
                               'actual spread / model spread':x.act_dev.mean()/x.model_mad.mean(),'rel. miss of line':x.act_dev.mean()/x.line.mean()})
print('HISTORICAL (2024-25, lines = matchup-adjusted usual levels):'); print(X.groupby('stat').apply(summ).round(2).to_string())
# actual market lines, 2026 weeks 3 graded ledger: how far actual lands from the market line, relative to the line
L=pd.read_csv('../ledgers/Slate_Results_Ledger.csv'); L=L[L.stat.isin(['Pass Yds','Rec Yds','Rush Yds'])]
L['dev']=(L.actual-L.market_line).abs()
print('\nREAL MARKET LINES (2026 Wk3, n=%d): rel. miss of line by stat'%len(L)); print((L.groupby('stat').dev.mean()/L.groupby('stat').market_line.mean()).round(3).to_string())
