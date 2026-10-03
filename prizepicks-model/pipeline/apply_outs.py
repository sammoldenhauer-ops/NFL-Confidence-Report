# Usage: edit OUTS / DROP_LINES, run after slate_inputs.py and before slate_sim.py.
# Confirmed outs only (official inactives / team announcements). Drops their lines, redistributes their share.
import pickle, pandas as pd
# Wk4 Sunday (Oct 4, 2026). Backup QBs: WAS Marcus Mariota (Daniels out, elbow), CHI Tyson Bagent (Williams out,
# hamstring - Keenum is NOT starting this week, drop his line), TB has no backup QB line on the board (Jalon
# Daniels expected to start, not priced by SGO yet) so TB simply has no Pass Yds/Pass TDs props this week.
DROP_LINES=[('WAS','Jayden Daniels'),('WAS','Rachaad White'),
            ('CHI','Case Keenum'),
            ('TB','Baker Mayfield'),
            ('NYG','Jaxson Dart'),
            ('NYJ','Breece Hall'),('NYJ','Adonai Mitchell'),('NYJ','Mason Taylor'),
            ('MIN','Justin Jefferson'),
            ('PHI','DeVonta Smith'),('PHI','Dallas Goedert'),('PHI','Hollywood Brown'),
            ('LA','Terrance Ferguson'),
            ('SEA','Jadarian Price'),
            ('CAR','Xavier Legette')]
# Shares are the model's own real computed tgt_share/car_share for each player (from slate_inputs.pkl), not estimates.
OUTS=[{'team':'WAS','player':'Rachaad White','recent_share':8.3,'kind':'targets'},
      {'team':'WAS','player':'Rachaad White','recent_share':25.0,'kind':'carries'},
      {'team':'NYJ','player':'Breece Hall','recent_share':9.8,'kind':'targets'},
      {'team':'NYJ','player':'Breece Hall','recent_share':61.0,'kind':'carries'},
      {'team':'NYJ','player':'Adonai Mitchell','recent_share':19.6,'kind':'targets'},
      {'team':'NYJ','player':'Adonai Mitchell','recent_share':3.1,'kind':'carries'},
      {'team':'NYJ','player':'Mason Taylor','recent_share':17.4,'kind':'targets'},
      {'team':'MIN','player':'Justin Jefferson','recent_share':29.4,'kind':'targets'},
      {'team':'MIN','player':'Justin Jefferson','recent_share':3.5,'kind':'carries'},
      {'team':'PHI','player':'DeVonta Smith','recent_share':26.3,'kind':'targets'},
      {'team':'PHI','player':'Dallas Goedert','recent_share':19.3,'kind':'targets'},
      {'team':'LA','player':'Terrance Ferguson','recent_share':9.3,'kind':'targets'},
      {'team':'LA','player':'Terrance Ferguson','recent_share':4.8,'kind':'carries'},
      {'team':'SEA','player':'Jadarian Price','recent_share':7.5,'kind':'targets'},
      {'team':'SEA','player':'Jadarian Price','recent_share':35.2,'kind':'carries'},
      {'team':'CAR','player':'Xavier Legette','recent_share':12.1,'kind':'targets'},
      {'team':'CAR','player':'Xavier Legette','recent_share':5.0,'kind':'carries'}]
NOTES=[('WAS','Jayden Daniels','Out','Elbow. Marcus Mariota starts.'),
       ('CHI','Caleb Williams','Out','Hamstring, 2nd straight game. Tyson Bagent starts (not Keenum).'),
       ('NYG','Jaxson Dart','Out for season','Knee, on IR. Jameis Winston starts.'),
       ('TB','Baker Mayfield','Out','Right thumb. Rookie Jalon Daniels expected to start his first NFL game - no line on our odds feed, so TB has no passing props this week.'),
       ('WAS','Terry McLaurin','Questionable','Hamstring - not dropped, unconfirmed.'),
       ('BAL','Zay Flowers','Questionable','Hamstring - not dropped, unconfirmed.'),
       ('BUF','Ray Davis','Questionable','Hamstring - not dropped, unconfirmed.'),
       ('SF','Mike Evans','Questionable','Ribs - not dropped, unconfirmed.'),
       ('LAC','Ladd McConkey','Questionable','Foot - not dropped, unconfirmed.'),
       ('TEN','Tyjae Spears','Questionable','Ankle - not dropped, unconfirmed; Tony Pollard would see a bigger role if he sits.'),
       ('SEA','Zach Charbonnet','Out','No props on our odds feed either way - no action needed.'),
       ('LAC','Charlie Kolar','Out','No props on our odds feed either way - no action needed.'),
       ('LAC','Brenen Thompson','Out','No props on our odds feed either way - no action needed.'),
       ('CIN','Colbie Young','Out','No props on our odds feed either way - no action needed.')]
B=pd.read_pickle('board.pkl'); keep=~B.set_index(['team','player']).index.isin(DROP_LINES)
print('lines dropped:',(~keep).sum()); B[keep].to_pickle('board.pkl')
I=pickle.load(open('slate_inputs.pkl','rb')); P=I['P']
I['P']=P[~P.set_index(['team','player']).index.isin(DROP_LINES)].reset_index(drop=True)
I['flags']=pd.DataFrame(OUTS); I['notes']=pd.DataFrame(NOTES,columns=['team','player','status','note']); pickle.dump(I,open('slate_inputs.pkl','wb'))
print(I['flags'].to_string(index=False))
print('QBs left on board:',B[keep&B['stat'].eq('Pass Yds')][['team','player']].values.tolist())
