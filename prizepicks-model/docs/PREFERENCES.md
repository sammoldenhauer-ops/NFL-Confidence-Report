# Working with Sam - preferences and rules

## Communication
- Lead with the answer. Short, mobile-friendly (he often reads on his phone). Plain English; tables are fine.
- He is new to betting math (EV, break-even, Power vs Flex, units, lift). Explain like to a beginner, with a worked
  example using his own numbers. He wants to learn to do the math himself, not just get answers.
- If he's wrong, tell him directly (he asks for this), and if you were wrong, say so plainly and fix it.
- Be upfront about sample sizes and what a result rests on (he caught a one-game tuning shortcut - re-do it properly).
- **Never use the words "genuine", "genuinely", "real", or "honestly"** - anywhere he reads it, including generated
  report text, site copy and card text ("real (x)" phrasing too). He has asked repeatedly.
- When a metric has a weighted and an unweighted version, report only the weighted one in chat.

## Data integrity (he has caught each of these)
- Verify every stat claim (target counts, who leads a team, ranks) against data before writing it. Never infer.
- Never change a player's team from memory - trust the data or Sam.
- Before finalizing any player-share file (target/rush/touch share), normalize names (lowercase, strip punctuation,
  Jr/Sr/II/III/IV) and check for duplicate players within a team. Do it proactively every time.
- Double-check spread direction before stating a favorite.
- Grade before re-running a slate; keep odds snapshots.

## Betting guidance he has accepted
- Positive EV is necessary but not enough: require ~5% EV per live leg (cushion).
- Stakes: small fixed units (~1% of bankroll); quarter-Kelly as the formula. Don't size up to recover losses -
  stakes come from the current bankroll, not what was lost. Overlapping entries are one bet.
- Always use the app's payout and the PrizePicks line, not the book line or standard payouts.
- He logs entries for grading - keep `ledgers/Entry_Ledger.csv` updated when he sends them (screenshots of results).

## If the site shows matchup cards (rules from his other NFL content work)
- Pill color = good or bad news for the featured player in that box, judged from the fact itself - never from the
  raw number's face value and never hedged to yellow/orange when it's clearly one or the other. An elite opposing
  defense is bad news (red/orange) even inside a BEST MATCHUP box; a weak defense ranked 25th is good news
  (blue/green) even inside a WORST MATCHUP box. Re-read every pill standalone before presenting.
- Never use a player's own-team target/role pecking order as a matchup negative or positive - it's true every week.
  Positives/negatives must come from how his skills meet that defense's strengths/weaknesses.
- When rebuilding a section (e.g. defensive rankings), carry over every category from the previous version
  (once "Missed Tackle %" was silently dropped) - compare category counts.
- Spread sign must match the projected scores on the card: higher model score = negative spread (favorite).
  Derive it from the model's two scores, not from Vegas's favorite.
- HTML: check the file ends with a well-formed `</div></body></html>` (string edits have corrupted it to `/div>`).
- The banned-words rule applies inside card text and pill labels.

## Site brand
"The Fantasy Playbook" - aimed at casual fantasy players: approachable, not overwhelming with numbers, even though
the data underneath is in-depth. Hosted on Vercel; built in VS Code. Small-scale monetization planned later.
