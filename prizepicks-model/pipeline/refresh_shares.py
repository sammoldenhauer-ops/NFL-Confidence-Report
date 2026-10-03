# Refresh FULL_LEAGUE_TARGET_AND_RUSH_SHARES.csv blended columns with 2026 season-to-date shares.
# Blend keeps the file's original weighting: 1 game of 2026 data = 30% (targets) / 35% (carries) vs preseason,
# i.e. weight = games/(games+k), k=2.33 targets, 1.86 carries. Usage: python3 refresh_shares.py [max_week]
import pandas as pd, numpy as np, re, sys, warnings; warnings.filterwarnings('ignore')
MAXW=int(sys.argv[1]) if len(sys.argv)>1 else 99; KT,KR=7/3,13/7
nm=lambda s: re.sub(r'[^a-z]','',re.sub(r'\b(jr|sr|ii|iii|iv)\b','',str(s).lower()))
def ytd(maxw):
    d=pd.read_csv('pbp_latest.csv',usecols=['game_id','week','season_type','posteam','play_type','receiver_player_id','rusher_player_id','passer_player_id','qb_kneel'],low_memory=False)
    d=d[(d.season_type=='REG')&(d.week<=maxw)&d.play_type.isin(['pass','run'])]
    app=pd.concat([d[['game_id','posteam',c]].rename(columns={c:'pid'}) for c in ['receiver_player_id','rusher_player_id','passer_player_id']]).dropna().drop_duplicates()
    tg=d[(d.play_type=='pass')&d.receiver_player_id.notna()]; ru=d[(d.play_type=='run')&(d.qb_kneel!=1)&d.rusher_player_id.notna()]
    T=tg.groupby(['game_id','posteam']).size().rename('TT'); R=ru.groupby(['game_id','posteam']).size().rename('TR')
    a=app.merge(T,on=['game_id','posteam'],how='left').merge(R,on=['game_id','posteam'],how='left').fillna(0)
    a=a.merge(tg.groupby(['game_id','posteam','receiver_player_id']).size().rename('t').reset_index().rename(columns={'receiver_player_id':'pid'}),on=['game_id','posteam','pid'],how='left')
    a=a.merge(ru.groupby(['game_id','posteam','rusher_player_id']).size().rename('c').reset_index().rename(columns={'rusher_player_id':'pid'}),on=['game_id','posteam','pid'],how='left').fillna(0)
    g=a.groupby(['posteam','pid']).agg(games=('game_id','nunique'),t=('t','sum'),TT=('TT','sum'),c=('c','sum'),TR=('TR','sum')).reset_index()
    g['ytd_t']=g.t/g.TT.clip(lower=1)*100; g['ytd_r']=g.c/g.TR.clip(lower=1)*100
    ref=pd.read_csv('players.csv',low_memory=False)[['gsis_id','display_name','position']]
    g=g.merge(ref,left_on='pid',right_on='gsis_id',how='left'); g['k']=g.display_name.map(nm)
    return g.rename(columns={'posteam':'team'})
def blend(f,g):
    f=f.copy(); f['k']=f.player.map(nm)
    m=f.merge(g[['team','k','games','ytd_t','ytd_r']],on=['team','k'],how='left')
    wt=m.games/(m.games+KT); wr=m.games/(m.games+KR)
    m['blended_target_share_pct']=np.where(m.target_share_pct.notna()&m.ytd_t.notna(),wt*m.ytd_t+(1-wt)*m.target_share_pct,m.ytd_t.fillna(m.target_share_pct)).round(1)
    m['blended_rush_share_pct']=np.where(m.rush_share_pct.notna()&m.ytd_r.notna()&(m.ytd_r>0),wr*m.ytd_r+(1-wr)*m.rush_share_pct,
                                         np.where(m.ytd_r>0,m.ytd_r,m.rush_share_pct)).round(1)
    # players with 2026 volume but missing from the file (rookies, new roles): add them
    new=g[~g.set_index(['team','k']).index.isin(f.set_index(['team','k']).index)&((g.ytd_t>=5)|(g.ytd_r>=10))&(g.position!='QB')]
    add=pd.DataFrame({'team':new.team,'player':new.display_name,'position':new.position,'games':new.games,'ytd_t':new.ytd_t,'ytd_r':new.ytd_r,
                      'blended_target_share_pct':new.ytd_t.round(1),'blended_rush_share_pct':new.ytd_r.where(new.ytd_r>0).round(1)})
    m=pd.concat([m,add],ignore_index=True)
    return m.rename(columns={'games':'ytd_games','ytd_t':'ytd_target_share_pct','ytd_r':'ytd_rush_share_pct'}).drop(columns='k')
if __name__=='__main__':
    f=pd.read_csv('FULL_LEAGUE_TARGET_AND_RUSH_SHARES.csv')
    f=f.drop(columns=[c for c in ['ytd_games','ytd_target_share_pct','ytd_rush_share_pct'] if c in f])
    out=blend(f,ytd(MAXW))
    out['kk']=out.player.map(nm); dup=out[out.duplicated(['team','kk'],keep=False)]
    print('rows',len(out),'| added',out.target_share_pct.isna().sum()-f.target_share_pct.isna().sum(),'| name collisions:',len(dup))
    if len(dup): print(dup[['team','player']].to_string()); sys.exit('fix collisions first')
    out.drop(columns='kk').sort_values(['team','player']).to_csv('FULL_LEAGUE_TARGET_AND_RUSH_SHARES.csv',index=False)
