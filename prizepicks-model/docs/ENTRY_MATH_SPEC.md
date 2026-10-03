# Entry Builder - exact math (port this 1:1 to the website)

Source of truth: `pipeline/slate_book3.py` (Entry Builder sheet + hidden Calc sheet). The spreadsheet version was
verified cell-by-cell against Python on the same simulation rows. A web version must reproduce the same numbers
from the same sims - write a test that loads the report's Sims sheet and compares.

## Inputs
Up to 6 legs, each: `player`, `stat`, `side` ('More' | 'Less'), `line` (number; any value, not only ladder lines),
`free` (bool - promo "free space"). Plus: `playType` ('Power' | 'Flex'), `mult` (app 'To Win' multiplier for all
legs hitting; optional), `mult1` / `mult2` (Flex payouts with 1 / 2 misses; optional), `bankroll` (optional).
Settings: `CUT` = 0.01 safety cut per leg, `CUSH` = 0.05 cushion per live leg, `KELLY` = 0.25.
Data: `sims[key]` = array of NS = 2,000 simulated values for key "Player | Stat" (same row index = same simulated
game across all keys - that is what makes correlation work). Rounded to integers in the workbook.

## Per leg
- `used` = player, stat, side, line all set AND key exists in sims.
- `live` = used AND NOT free.
- `team` = lookup of the player-stat's team.
- `type` = 'QBY' if stat == 'Pass Yds'; 'QBTD' if 'Pass TDs'; 'REC' if stat in {Rec Yds, Receptions, Rush+Rec Yds};
  'TD' if 'Anytime TDs'; else 'OTHER'.
- `p` (shown "Chance it hits") = free ? 0.99 : count(sims[key] > line) / NS for More, count(sims[key] < line) / NS for Less.
- `stack` factor (live legs only, else 1):
  - type QBY: n = number of live legs with same team, type REC, same side as this leg -> n>=3: 0.90, n==2: 0.95, else 1.
  - type QBTD with side More: if any live leg with same team, type TD, side More -> 0.90, else 1.
  - else 1.
- `cutRatio` = live ? max(p - CUT, 0.01) / p : 1.

## Per simulated game s (Calc sheet)
- hit[s][leg] = !live ? 1 : (side == 'Less' ? sims[key][s] < line : sims[key][s] > line)   (free/unused legs count as hits)
- misses[s] = 6 - sum(hit[s][*])

## Entry numbers
- legsUsed = count(used); liveLegs = count(live); freeLegs = legsUsed - liveLegs.
- allRaw = count(misses == 0) / NS; oneRaw = count(misses == 1) / NS; twoRaw = count(misses == 2) / NS.
- stackTotal = product(stack); cutTotal = product(cutRatio).
- independent = product(p over used legs)   (display only: "if unrelated").
- **allHit = allRaw x stackTotal x cutTotal x 0.99^freeLegs**
- defaultPayout = playType == 'Flex' ? standardFlexAll[legsUsed] : standardPower[legsUsed].
- payout = mult ?? defaultPayout.
- powerEV = allHit x payout - 1   (needs legsUsed >= 2).
- flexPay1 = mult1 ?? standardFlex1[legsUsed]; flexPay2 = mult2 ?? standardFlex2[legsUsed] (0 if none).
- flexEV = allHit x payout + oneRaw x flexPay1 + twoRaw x flexPay2 - 1   (needs legsUsed >= 3).
  (The safety cut and corrections are applied to the all-hit term only.)
- EV = playType == 'Flex' ? flexEV : powerEV.
- cushion = liveLegs x CUSH.
- breakEven (display) = Power: 1 / payout; Flex: "see EV".
- chanceLoses = Power: 1 - allHit; Flex: 1 - allHit - oneRaw x [flexPay1 > 0] - twoRaw x [flexPay2 > 0].

## Rule checks (PrizePicks)
1. Same player in two legs -> "Same player picked twice - PrizePicks does not allow that."
2. legsUsed >= 2 and all used legs on one team -> "All legs are from one team - PrizePicks needs at least 2 teams."
3. Any Anytime TDs leg on Less -> "Anytime TD Less is not offered on PrizePicks (More only)."
4. A leg with a player but missing stat/side/line -> "A leg is missing its stat, side or line - it is being ignored."
5. stackTotal < 1 -> note "Stack correction applied: x{stackTotal}".
ruleBreaks = count of checks 1-3 that fire.

## Verdict
```
if legsUsed < 2:                      "Add at least 2 legs"
elif ruleBreaks > 0:                  "FIX LEGS"
elif Flex and legsUsed < 3:           "Flex needs 3+ legs"
elif EV is missing:                   "Enter the multiplier"
elif EV <= 0:                         "SKIP"   reason: "Loses money on average (EV per $1)."
elif EV < cushion:                    "SKIP"   reason: "Positive (EV) but below the (cushion) cushion for N live legs. Too thin to trust."
else:                                 "PLAY"   reason: "Clears the (cushion) cushion with (EV) expected profit per $1."
(+ " Using the STANDARD payout - type the app multiplier." when mult is blank)
```

## Stake
stake = bankroll blank -> prompt; verdict != PLAY (EV <= 0, EV < cushion, or rule breaks) -> 0;
else floor_to_0.25( bankroll x KELLY x EV / (payout - 1) ).

## "Show the math" lines (keep these - Sam is learning)
1. Unrelated: p1 x p2 x ... = independent
2. Simulated together: allRaw (x{allRaw/independent} vs unrelated) [+ free space note]
3. allRaw x stackTotal x cutTotal [x 0.99 per free leg] = allHit
4. Break-even: 1 / payout = 1/payout
5. EV: allHit x payout - 1 = EV   (Flex: allHit x payout + oneRaw x pay1 + twoRaw x pay2 - 1)
6. Cushion: liveLegs x 5% = cushion needed
7. Stake: bankroll x 0.25 x EV / (payout - 1) = stake

## Dropdown behaviour
Player list = all players on the slate. Stat list = only that player's priced stats (order: Pass Yds, Pass TDs,
Rush Yds, Rec Yds, Receptions, Rush+Rec Yds, Anytime TDs). Line list = that player-stat's ladder lines plus the
book line, ascending; custom lines allowed (warning, not rejection). Show the book line next to the chosen line.

## Reference test cases (Wk4 TNF sims, standard payouts unless stated)
- Example 4-leg (Boston Rec More 2.5, Sanders Rec More 1.5, Rodgers Pass Yds Less 212.5, Metcalf Rush+Rec Less 42.5):
  legs 56.5 / 59.2 / 50.8 / 48.8%; independent 8.3%; allRaw 12.0% (x1.45); cut 0.927; allHit 11.1%; payout 10x;
  EV +10.8%; cushion +20% -> SKIP.
- Rodgers Pass Yds More 212.5 + Metcalf Rec More 41.5 + Pittman Rec More 34.5 + Freiermuth Rec More 30.5 + Boston
  Receptions More 2.5, mult 20, bankroll 200: stack x0.90; allHit 5.1%; EV +1% -> SKIP, stake $0.
- Same player twice + one team + TD Less -> FIX LEGS.
- Watson Pass Yds More 0.5 (free) + Rodgers Pass Yds More 212.5 + Metcalf Rec More 41.5 + Freiermuth Rec More 30.5,
  mult 5.25, bankroll 100: free leg 99%; stack x0.95; allHit 17.0%; break-even 19.0%; EV -11% -> SKIP.
