# Build a synthetic "slate" of 2025 games from pre-game info only, run slate_sim.py on it,
# and record actual outcomes with matchup-adjusted usual-level lines.
import pandas as pd, numpy as np, pickle, shutil, os, sys, warnings; warnings.filterwarnings('ignore')
HERE=os.path.dirname(os.path.abspath(__file__)); SRC=os.path.join(HERE,'..','pipeline'); os.chdir(HERE)
for f in ['slate_sim.py','slate_eff.pkl','gamescript_coefs.json','condisp.json','share_shift.json','pass_rec_params.json','outcome_pools.npz','pass_pool.npy']: shutil.copy(f'{SRC}/{f}',f)
cols=['game_id','season','week','season_type','posteam','defteam','home_team','away_team','spread_line','total_line','play_type','passer_player_id',
      'receiver_player_id','rusher_player_id','yards_gained','complete_pass','qb_kneel','sack','pass_attempt','pass_touchdown','rush_touchdown','td_player_id']
d=pd.concat([pd.read_csv(f'{SRC}/pbp_{y}.csv',usecols=cols,low_memory=False) for y in (2024,2025)]); d=d[d.season_type=='REG']; d['wk']=d.week; d['week']=d.season*100+d.week
off=d[d.play_type.isin(['pass','run'])]
ref=pd.read_csv(f'{SRC}/players.csv',low_memory=False).set_index('gsis_id')['position']
games=d.drop_duplicates('game_id')[['game_id','week','home_team','away_team','spread_line','total_line']]
# per team-game volumes + per player-game stats
tv=off.groupby(['game_id','posteam']).agg(tgts=('receiver_player_id',lambda x:x.notna().sum()),att=('pass_attempt','sum'),
      car=('rusher_player_id',lambda x:0)).reset_index()
tv['car']=off[(off.play_type=='run')&(off.qb_kneel!=1)].groupby(['game_id','posteam']).size().reindex(list(zip(tv.game_id,tv.posteam))).fillna(0).values
tv=tv.merge(games[['game_id','week']],on='game_id')
pas=off[(off.play_type=='pass')&(off.sack!=1)&off.passer_player_id.notna()]
qb=pas.groupby(['game_id','posteam','passer_player_id']).agg(att=('pass_attempt','sum')).reset_index().rename(columns={'passer_player_id':'pid'})
qb['y']=pas[pas.complete_pass==1].groupby(['game_id','passer_player_id']).yards_gained.sum().reindex(list(zip(qb.game_id,qb.pid))).fillna(0).values
rc=off[(off.play_type=='pass')&off.receiver_player_id.notna()]
rec=rc.groupby(['game_id','posteam','receiver_player_id']).size().rename('tg').reset_index().rename(columns={'receiver_player_id':'pid'})
rec['y']=rc[rc.complete_pass==1].groupby(['game_id','receiver_player_id']).yards_gained.sum().reindex(list(zip(rec.game_id,rec.pid))).fillna(0).values
rs=off[(off.play_type=='run')&(off.qb_kneel!=1)&off.rusher_player_id.notna()]
ru=rs.groupby(['game_id','posteam','rusher_player_id']).agg(car=('yards_gained','size'),y=('yards_gained','sum')).reset_index().rename(columns={'rusher_player_id':'pid'})
sc=off[(off.pass_touchdown==1)|(off.rush_touchdown==1)].groupby(['game_id','td_player_id']).size()
ptd=off.groupby(['game_id','posteam']).pass_touchdown.sum()
wk=games.set_index('game_id').week
for x in (qb,rec,ru): x['week']=x.game_id.map(wk)
def prior_stats(x,vol,team_tot=None):
    x=x.sort_values('week'); x['season']=x.week//100; g=x.groupby(['season','posteam','pid'])
    x['n']=g.cumcount(); x['line0']=(g.y.cumsum()-x.y)/x.n.replace(0,np.nan); x['vol_prior']=(g[vol].cumsum()-x[vol])/x.n.replace(0,np.nan)
    return x
QB=prior_stats(qb,'att'); RC=prior_stats(rec,'tg'); RU=prior_stats(ru,'car')
TV=tv.sort_values('week'); TV['season']=TV.week//100; gt=TV.groupby(['season','posteam'])
for c in ['tgts','att','car']: TV['p_'+c]=(gt[c].cumsum()-TV[c])/gt.cumcount().replace(0,np.nan)
TV['n']=gt.cumcount()
# ---- choose games: weeks 6-18, sample
rng=np.random.default_rng(5); G=games[(games.week%100>=6)].copy()
NG=int(sys.argv[1]) if len(sys.argv)>1 else 120; G=G.sample(min(NG,len(G)),random_state=5)
Prows=[]; Brows=[]; base={}; roles=[]; Grows=[]
for gm in G.itertuples():
    ok=True; rr={}
    for team,opp,sign in [(gm.home_team,gm.away_team,1),(gm.away_team,gm.home_team,-1)]:
        lab=f'{team}|{gm.game_id}'; tvr=TV[(TV.game_id==gm.game_id)&(TV.posteam==team)]
        if tvr.empty or tvr.n.iloc[0]<4: ok=False; break
        base[lab]={'tgts':tvr.p_tgts.iloc[0],'att':tvr.p_att.iloc[0],'car':tvr.p_car.iloc[0]}
        q=QB[(QB.game_id==gm.game_id)&(QB.posteam==team)&(QB.n>=4)].sort_values('vol_prior')
        if q.empty: ok=False; break
        q=q.iloc[-1]
        R=RC[(RC.game_id==gm.game_id)&(RC.posteam==team)&(RC.n>=4)].sort_values('vol_prior',ascending=False).head(3)
        U=RU[(RU.game_id==gm.game_id)&(RU.posteam==team)&(RU.n>=4)&(RU.pid!=q.pid)].sort_values('vol_prior',ascending=False).head(2)
        if len(R)<3 or len(U)<2: ok=False; break
        rr[team]=(lab,q,R,U)
    if not ok: continue
    Grows.append({'home':f'{gm.home_team}|{gm.game_id}','away':f'{gm.away_team}|{gm.game_id}','home_exp_margin':gm.spread_line,'total':gm.total_line,'game_id':gm.game_id})
    for team,(lab,q,R,U) in rr.items():
        TT=base[lab]; players={}
        def add(pid,stat,line,role,actual):
            nm=f'{pid}|{gm.game_id}'
            players.setdefault(pid,{'team':lab,'player':nm,'pid':pid,'pos':ref.get(pid),'tgt_share':np.nan,'car_share':np.nan,'att_share':np.nan})
            Brows.append({'event':gm.game_id,'home':Grows[-1]['home'],'away':Grows[-1]['away'],'player':nm,'team':lab,'stat':stat,'line':line,'fair':line,'book_p_over':np.nan})
            roles.append({'game_id':gm.game_id,'team':lab,'role':role,'player':nm,'stat':stat,'actual':actual,'line0':line})
        players[q.pid]={'team':lab,'player':f'{q.pid}|{gm.game_id}','pid':q.pid,'pos':'QB','tgt_share':np.nan,'car_share':np.nan,'att_share':0.97}
        add(q.pid,'Pass Yds',q.line0,'qb',q.y); add(q.pid,'Pass TDs',1.5,'qb_ptd',ptd.get((gm.game_id,team),0))
        for i,r in enumerate(R.itertuples()):
            add(r.pid,'Rec Yds',r.line0,f'r{i+1}',r.y); add(r.pid,'Anytime TDs',0.5,f'r{i+1}_td',int(sc.get((gm.game_id,r.pid),0)>0))
            players[r.pid]['tgt_share']=r.vol_prior/TT['tgts']
        for i,u in enumerate(U.itertuples()):
            add(u.pid,'Rush Yds',u.line0,f'rb{i+1}',u.y); add(u.pid,'Anytime TDs',0.5,f'rb{i+1}_td',int(sc.get((gm.game_id,u.pid),0)>0))
            players[u.pid]['car_share']=u.vol_prior/TT['car']
        Prows+=list(players.values())
P=pd.DataFrame(Prows); B=pd.DataFrame(Brows).drop_duplicates(['player','stat']); Gd=pd.DataFrame(Grows); Ro=pd.DataFrame(roles)
I0=pickle.load(open(f'{SRC}/slate_inputs.pkl','rb'))
pickle.dump({'P':P,'base':base,'rdef':{},'flags':pd.DataFrame(columns=['team','player','recent_share','kind']),'LG_YPA':I0['LG_YPA'],'LG_TDR':I0['LG_TDR']},open('slate_inputs.pkl','wb'))
B.to_pickle('board.pkl'); Gd.to_pickle('slate_games.pkl'); Ro.to_pickle('roles.pkl')
# TD params with team labels
T=pickle.load(open(f'{SRC}/td_params.pkl','rb')); labs=pd.DataFrame({'posteam':[l.split('|')[0] for l in base],'lab':list(base)})
for k in ['RZ','GL']: T[k]=T[k].merge(labs,on='posteam').drop(columns='posteam').rename(columns={'lab':'posteam'})
T['team_pf']={l:T['team_pf'].get(l.split('|')[0],T['LG_PF']) for l in base}
pickle.dump(T,open('td_params.pkl','wb'))
print(f'games {len(Gd)} | team-games {len(base)} | players {len(P)} | board rows {len(B)}')
