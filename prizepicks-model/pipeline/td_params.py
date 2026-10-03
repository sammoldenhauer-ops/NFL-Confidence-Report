# Builds TD-model parameters from play-by-play. Usage: python3 td_params.py [exclude_game_id,...]
# Outputs td_params.pkl: league/team TD-per-point + pass-TD fraction, and per-player red-zone / goal-line usage.
import pandas as pd, numpy as np, pickle, sys, warnings; warnings.filterwarnings('ignore')
EXCL=set(sys.argv[1].split(',')) if len(sys.argv)>1 else set()
cols=['game_id','season','week','season_type','posteam','defteam','home_team','away_team','play_type','yardline_100','receiver_player_id',
      'rusher_player_id','pass_touchdown','rush_touchdown','td_team','qb_kneel','total_home_score','total_away_score']
d=pd.concat([pd.read_csv(f,usecols=cols,low_memory=False) for f in ['pbp_2024.csv','pbp_2025.csv','pbp_latest.csv']])
d=d[(d.season_type=='REG')&~d.game_id.isin(EXCL)].drop_duplicates(); d['t']=d.season*100+d.week
# team points and offensive TDs per game
fin=d.groupby('game_id').agg(home=('home_team','first'),away=('away_team','first'),hs=('total_home_score','max'),as_=('total_away_score','max'),t=('t','first')).reset_index()
pts=pd.concat([fin.rename(columns={'home':'team','hs':'pts'})[['game_id','t','team','pts']],fin.rename(columns={'away':'team','as_':'pts'})[['game_id','t','team','pts']]])
off=d[d.play_type.isin(['pass','run'])]
td=off.groupby(['game_id','posteam']).agg(ptd=('pass_touchdown','sum'),rtd=('rush_touchdown','sum')).reset_index().rename(columns={'posteam':'team'})
tg=pts.merge(td,on=['game_id','team'],how='left').fillna(0); tg['otd']=tg.ptd+tg.rtd
rec=tg[tg.t>=202500]
TDPP=rec.otd.sum()/rec.pts.sum(); LG_PF=rec.ptd.sum()/rec.otd.sum()
team_pf={t:(g.ptd.sum()+20*LG_PF)/(g.otd.sum()+20) for t,g in rec.groupby('team')}      # shrunk pass-TD fraction
# player usage: red-zone targets (inside 20) and goal-line carries (inside 5), season 2025+ with current team
p_=off[off.play_type=='pass'&off.receiver_player_id.notna()] if False else off[(off.play_type=='pass')&off.receiver_player_id.notna()]
r_=off[(off.play_type=='run')&(off.qb_kneel!=1)&off.rusher_player_id.notna()]
def usage(x,col,zone):
    x=x[x.t>=202500]; x=x.assign(z=x.yardline_100<=zone)
    last=x.sort_values('t').groupby(col).posteam.last()
    x=x[x.posteam==x[col].map(last)]                      # only games with current team
    pl=x.groupby([col,'posteam']).agg(n=('z','size'),nz=('z','sum')).reset_index()
    tm=x.groupby('posteam').agg(N=('z','size'),NZ=('z','sum')).reset_index()
    # team totals only over games the player appeared in would be better; use team totals across same span (approx.)
    pl=pl.merge(tm,on='posteam'); pl['share']=pl.n/pl.N; pl['zshare']=pl.nz/pl.NZ.clip(lower=1)
    return pl.rename(columns={col:'pid'})
RZ=usage(p_,'receiver_player_id',20); GL=usage(r_,'rusher_player_id',5)
# zone multiplier = shrunk zone share / volume share (backtest: k=80 targets inside 20, k=8 carries inside 5;
# held-out 2025 wks 12-18 log loss 0.3989 vs 0.4020 volume-only)
for X,k in [(RZ,80),(GL,8)]:
    X['zone_shrunk']=(X.nz+k*X.share)/(X.NZ+k); X['mult']=(X.zone_shrunk/X.share.clip(lower=1e-3)).clip(0.25,4)
pickle.dump({'TDPP':TDPP,'LG_PF':LG_PF,'team_pf':team_pf,'RZ':RZ,'GL':GL},open('td_params.pkl','wb'))
print(f"TDs per team point {TDPP:.4f} | league pass-TD share {LG_PF:.3f} | teams {len(team_pf)} | RZ rows {len(RZ)} GL rows {len(GL)}")
