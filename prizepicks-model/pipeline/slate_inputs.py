import warnings; warnings.filterwarnings('ignore')
import pandas as pd, numpy as np, re, json
B=pd.read_pickle('board.pkl'); G=pd.read_pickle('slate_games.pkl')
cols=['season','week','game_id','season_type','play_type','pass_attempt','sack','qb_kneel','posteam','defteam','passer_player_id','passer_player_name','receiver_player_id','rusher_player_id','passing_yards','receiving_yards','rushing_yards','air_yards','complete_pass','pass_touchdown']
fr=[]
for f in ['pbp_2022.csv','pbp_2023.csv','pbp_2024.csv','pbp_2025.csv','pbp_latest.csv']:
    d=pd.read_csv(f,low_memory=False,usecols=cols); fr.append(d[d['season_type']=='REG'])
H=pd.concat(fr,ignore_index=True); H['t']=H['season']*100+H['week']
pas=H[H['play_type']=='pass']; run=H[(H['play_type']=='run')&(H['qb_kneel']!=1)]
att=pas[(pas['pass_attempt']==1)&(pas['sack']!=1)&pas['passer_player_id'].notna()]
# ---- team-game volumes & EWM base (2025-2026) ----
tv=pd.concat([pas[pas['receiver_player_id'].notna()].groupby(['t','game_id','posteam']).size().rename('tgts'),
              att.groupby(['t','game_id','posteam']).size().rename('att'),run.groupby(['t','game_id','posteam']).size().rename('car')],axis=1).reset_index()
tv=tv[tv['t']>=202500].sort_values(['posteam','t'])
base={t:{c:g[c].ewm(halflife=8).mean().iloc[-1] for c in ['tgts','att','car']} for t,g in tv.groupby('posteam')}
# ---- player shares by game ----
def shares(df,idcol,vol):
    x=df[df[idcol].notna()].groupby(['t','game_id','posteam',idcol]).size().rename('n').reset_index()
    x=x.merge(tv[['game_id','posteam',vol]],on=['game_id','posteam']); x['sh']=x['n']/x[vol]; return x.rename(columns={idcol:'pid'})
RS=shares(pas,'receiver_player_id','tgts'); US=shares(run,'rusher_player_id','car'); QS=shares(att,'passer_player_id','att')
# main QB per team-game
mainqb=att.groupby(['game_id','posteam'])['passer_player_id'].agg(lambda s:s.value_counts().idxmax()).rename('qb').reset_index()
# ---- efficiency (2022-2026), shrunk ----
rc=pas[pas['receiver_player_id'].notna()].groupby('receiver_player_id').agg(tg=('receiving_yards','size'),yds=('receiving_yards',lambda s:s.fillna(0).sum()),air=('air_yards',lambda s:s.fillna(0).sum()),rec=('complete_pass','sum'))
ru=run[run['rusher_player_id'].notna()].groupby('rusher_player_id').agg(car=('rushing_yards','size'),yds=('rushing_yards',lambda s:s.fillna(0).sum()))
qa=att.groupby('passer_player_id').agg(att=('passing_yards','size'),yds=('passing_yards',lambda s:s.fillna(0).sum()),td=('pass_touchdown','sum'))
LG_TDR=att['pass_touchdown'].mean(); LG_YPA=att['passing_yards'].fillna(0).mean()
# game-level SDs for low-volume fallback
rg=pas[pas['receiver_player_id'].notna()].groupby(['game_id','receiver_player_id']).agg(yds=('receiving_yards',lambda s:s.fillna(0).sum()),rec=('complete_pass','sum'))
ug=run[run['rusher_player_id'].notna()].groupby(['game_id','rusher_player_id'])['rushing_yards'].sum()
# ---- run-defense multipliers (validated: k=400 carries, strength 0.5; prior season at 1/3 weight) ----
lgc=run[run['season']==2025]['rushing_yards'].fillna(0).mean(); rdef={}
for t in tv['posteam'].unique():
    r25=run[(run['season']==2025)&(run['defteam']==t)]['rushing_yards'].fillna(0); r26=run[(run['season']==2026)&(run['defteam']==t)]['rushing_yards'].fillna(0)
    rdef[t]=((r26.sum()+r25.sum()/3+400*lgc)/(len(r26)+len(r25)/3+400)/lgc)**0.5
# ---- name -> id (prefer players seen on that team in 2026) ----
ref=pd.read_csv('players.csv',low_memory=False)[['gsis_id','display_name','position']]
nm=lambda s:re.sub(r"(jr|sr|ii|iii|iv)$","",re.sub(r"[^a-z]","",str(s).lower()))
ref['k']=ref['display_name'].map(nm)
seen26=pd.concat([RS[RS['t']>=202600][['pid','posteam']],US[US['t']>=202600][['pid','posteam']],QS[QS['t']>=202600][['pid','posteam']]]).drop_duplicates()
def resolve(name,team):
    name={'Joshua Palmer':'Josh Palmer'}.get(name,name)
    c=ref[ref['k']==nm(name)]['gsis_id'].tolist()
    if len(c)>1:
        s=[x for x in c if ((seen26['pid']==x)&(seen26['posteam']==team)).any()]
        c=s or c
    return c[0] if c else None
pre=pd.read_csv('FULL_LEAGUE_TARGET_AND_RUSH_SHARES.csv')
prek=pre.assign(k=pre['player'].map(nm)).set_index(['team','k'])
def share(df,pid,team,prekey,col=None):
    g=df[df['pid']==pid].sort_values('t')
    if len(g)==0 or (g['posteam'].iloc[-1]!=team):   # changed team or no history -> 2026 with this team only
        g=g[(g['posteam']==team)&(g['t']>=202600)]
    if len(g)>=2: return float(g['sh'].ewm(halflife=6).mean().iloc[-1]),len(g),'data'
    v=float(g['sh'].iloc[0]) if len(g)==1 else None
    bv=None                                           # thin history: fall back to the blended share file
    if col:                                           # (v5 looked this up but never used it - fixed Sep 29)
        try:
            p=prek.loc[(team,prekey)]; x=(p[col].iloc[0] if isinstance(p,pd.DataFrame) else p[col])
            bv=float(x)/100 if pd.notna(x) else None
        except KeyError: pass
    if v is not None and bv is not None: return 0.5*v+0.5*bv,len(g),'thin+blended'
    if bv is not None: return bv,0,'blended'
    return v,len(g),'thin'
players=B[['event','home','away','player','team']].drop_duplicates(['player','team'])
out=[]
for _,p in players.iterrows():
    pid=resolve(p['player'],p['team']); pos=ref.set_index('gsis_id')['position'].get(pid) if pid else None
    ts,tn,tq=share(RS,pid,p['team'],nm(p['player']),'blended_target_share_pct') if pid else (None,0,'none')
    cs,cn,cq=share(US,pid,p['team'],nm(p['player']),'blended_rush_share_pct') if pid else (None,0,'none')
    qs,qn,qq=share(QS,pid,p['team'],nm(p['player'])) if pid else (None,0,'none')
    out.append({**p.to_dict(),'pid':pid,'pos':pos,'tgt_share':ts,'tgt_n':tn,'car_share':cs,'car_n':cn,'att_share':qs,'att_n':qn})
P=pd.DataFrame(out)
# ---- QB-specific receiver shares where the board QB didn't start most recent games ----
qb_on_board=B[B['stat']=='Pass Yds'].groupby('team')['player'].first().to_dict()
adj=[]
for team,qbname in qb_on_board.items():
    qpid=resolve(qbname,team)
    recent=mainqb[(mainqb['posteam']==team)&mainqb['game_id'].str.startswith('2026')]
    if len(recent)==0 or (recent['qb']==qpid).mean()>=0.5: continue
    qgames=list(mainqb[(mainqb['posteam']==team)&(mainqb['qb']==qpid)]['game_id'])
    sub=RS[RS['game_id'].isin(qgames)&(RS['posteam']==team)]
    for i,r in P[(P['team']==team)&P['pid'].notna()].iterrows():
        # only games where this player was active for this team (recorded a target or carry)
        active=set(RS[(RS['pid']==r['pid'])&(RS['posteam']==team)]['game_id'])|set(US[(US['pid']==r['pid'])&(US['posteam']==team)]['game_id'])
        g_act=[g for g in qgames if g in active]
        if len(g_act)>=3 and r['tgt_share'] is not None:
            ss=sub[sub['game_id'].isin(g_act)]
            qsh=ss[ss['pid']==r['pid']]['n'].sum()/ss.groupby('game_id')['tgts'].first().sum()
            nq=len(g_act)
            w=nq/(nq+6); new=w*qsh+(1-w)*r['tgt_share']
            if abs(new-r['tgt_share'])>=0.02: adj.append((team,qbname,r['player'],round(r['tgt_share']*100,1),round(new*100,1),nq))
            P.loc[i,'tgt_share']=new
# ---- likely-out flags: meaningful recent role, no line this week ----
board_ids=set(P['pid'].dropna()); flags=[]
for team in P['team'].unique():
    last=tv[(tv['posteam']==team)&(tv['t']>=202600)]['game_id'].tolist()[-2:]
    for df,kind,thr in [(RS,'targets',0.14),(US,'carries',0.30)]:
        r=df[df['game_id'].isin(last)&(df['posteam']==team)].groupby('pid')['sh'].mean()
        for pid_,sh in r[r>=thr].items():
            if pid_ not in board_ids:
                nmx=ref.set_index('gsis_id')['display_name'].get(pid_,pid_); flags.append({'team':team,'player':nmx,'recent_share':round(sh*100,1),'kind':kind})
F=pd.DataFrame(flags).drop_duplicates(['team','player','kind']) if flags else pd.DataFrame(columns=['team','player','recent_share','kind'])
pickle_obj={'P':P,'base':base,'rdef':rdef,'LG_TDR':LG_TDR,'LG_YPA':LG_YPA,'flags':F,'qbadj':adj}
import pickle; pickle.dump(pickle_obj,open('slate_inputs.pkl','wb'))
pickle.dump({'rc':rc,'ru':ru,'qa':qa,'rg':rg,'ug':ug},open('slate_eff.pkl','wb'))
print("players:",len(P),"| unresolved names:",P['pid'].isna().sum(), P[P['pid'].isna()]['player'].tolist()[:12])
print("\nQB-specific share adjustments:"); [print(" ",a) for a in adj]
print("\nLikely-out flags (recent role, no line):"); print(F.to_string(index=False))
