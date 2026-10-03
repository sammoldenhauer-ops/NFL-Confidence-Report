# Usage: edit OUTS / DROP_LINES, run after slate_inputs.py and before slate_sim.py.
# Confirmed outs only (official inactives / team announcements). Drops their lines, redistributes their share.
import pickle, pandas as pd
DROP_LINES=[('PIT','Rico Dowdle')]      # Wk4 TNF: Dowdle OUT (toe). His TD line would be voided anyway.
OUTS=[{'team':'PIT','player':'Rico Dowdle','recent_share':28.0,'kind':'carries'},    # 2026 wk1 share ~44%, but Warren's weighted share
      {'team':'PIT','player':'Rico Dowdle','recent_share':9.5,'kind':'targets'}]     # already includes wk3 without him (81%): 28% puts Warren ~0.80
NOTES=[('CLE','KC Concepcion','Not out','Healthy and practicing; no lines in our odds feed, so not in this report. His targets were NOT given away.'),
       ('CLE','Tylan Wallace','Not official','Knee, no practice all week. Only a 4% TD line; check inactives ~6:45 PM ET.'),
       ('PIT','Joey Porter Jr.','Out (traded to DAL)','CB. Reported traded to Dallas Wednesday night. Defense changes are already in the sportsbook lines.'),
       ('PIT','Jalen Ramsey / Brandin Echols','Questionable','CBs. If Ramsey sits, expect Cleveland passing lines to rise.'),
       ('CLE','Elgton Jenkins','Out','Starting center; Luke Wypler starts. Already in the sportsbook lines.')]
B=pd.read_pickle('board.pkl'); keep=~B.set_index(['team','player']).index.isin(DROP_LINES)
print('lines dropped:',(~keep).sum()); B[keep].to_pickle('board.pkl')
I=pickle.load(open('slate_inputs.pkl','rb')); P=I['P']
I['P']=P[~P.set_index(['team','player']).index.isin(DROP_LINES)].reset_index(drop=True)
I['flags']=pd.DataFrame(OUTS); I['notes']=pd.DataFrame(NOTES,columns=['team','player','status','note']); pickle.dump(I,open('slate_inputs.pkl','wb'))
print(I['flags'].to_string(index=False))
print('QBs left on board:',B[keep&B['stat'].eq('Pass Yds')][['team','player']].values.tolist())
