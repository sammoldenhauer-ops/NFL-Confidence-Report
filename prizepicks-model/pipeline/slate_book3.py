# v7 report generator. Usage: python3 slate_book3.py "<slate title>" <output.xlsx>
# Tabs: Start Here | Entry Builder | Top Entries | Best Legs | Player Lines | Injuries & Notes | Learn the Math | Settings
# Hidden: Sims (simulated games), Lists (dropdown sources), Calc (per-sim hit checks for the Entry Builder)
import sys, re, pickle, numpy as np, pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as CL
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule, FormulaRule
from openpyxl.worksheet.table import Table, TableStyleInfo

TITLE = sys.argv[1] if len(sys.argv) > 1 else 'Slate Report'
OUT = sys.argv[2] if len(sys.argv) > 2 else '../reports/Slate_Report.xlsx'
S = pickle.load(open('slate_sims_centered.pkl', 'rb')); L = pd.read_pickle('slate_legs_final.pkl')
E = pd.read_pickle('slate_entries.pkl'); G = pd.read_pickle('slate_games.pkl'); I = pickle.load(open('slate_inputs.pkl', 'rb'))
R = pd.read_pickle('ladder_rows.pkl'); NS = 2000; NLEG = 6
STAT_ORDER = ['Pass Yds', 'Pass TDs', 'Rush Yds', 'Rec Yds', 'Receptions', 'Rush+Rec Yds', 'Anytime TDs']

# ---------------- styles ----------------
def F(**k): return Font(name='Arial', **k)
NAVY = '1F3864'; HD = PatternFill('solid', start_color=NAVY); SUB = PatternFill('solid', start_color='D9E1F2')
IN = PatternFill('solid', start_color='FFF2CC'); INF = F(color='0000FF'); GREY = F(color='808080', size=9)
GREEN = PatternFill('solid', start_color='C6EFCE'); RED = PatternFill('solid', start_color='FFC7CE'); AMBER = PatternFill('solid', start_color='FFEB9C')
thin = Side(style='thin', color='BFBFBF'); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
def band(ws, row, text, ncol=8):
    for c in range(1, ncol + 1): ws.cell(row, c).fill = HD
    ws.cell(row, 1, text).font = F(bold=True, color='FFFFFF', size=11)
def hdr(ws, row, vals, col0=1):
    for j, v in enumerate(vals):
        c = ws.cell(row, col0 + j, v); c.font = F(bold=True); c.fill = SUB; c.alignment = Alignment(wrap_text=True, vertical='center'); c.border = BOX
def put(ws, ref, v, fmt=None, **fk):
    c = ws[ref]; c.value = v; c.font = F(**fk)
    if fmt: c.number_format = fmt
    return c
def inp(ws, ref, v=None, fmt=None):
    c = ws[ref]; c.value = v; c.font = INF; c.fill = IN; c.border = BOX
    if fmt: c.number_format = fmt
    return c

wb = Workbook(); wb.remove(wb.active)

# ---------------- Settings ----------------
st = wb.create_sheet('Settings')
put(st, 'A1', 'Settings', bold=True, size=14)
put(st, 'A2', 'Blue cells on yellow can be changed. Everything in the report recalculates from them.', italic=True)
band(st, 4, 'DECISION RULES', 5)
rules = [('Safety cut per leg', 0.01, '0.0%', 'Knocked off each leg before combining. The v5 3-point bias was fixed in v6; 1 point kept as a buffer until Week 4 grading.'),
         ('Cushion needed per leg', 0.05, '0%', 'An entry must beat break-even by this much per live leg (4 legs -> +20% EV) before the verdict says PLAY.'),
         ('Stake size (fraction of Kelly)', 0.25, '0%', 'Suggested stake = bankroll x this x EV / (payout - 1). A quarter keeps you safe if the model is a few points off.')]
for i, (k, v, fmt, note) in enumerate(rules, 5):
    put(st, f'A{i}', k, bold=True); inp(st, f'B{i}', v, fmt); put(st, f'C{i}', note, italic=True, color='595959')
HAIR, CUSH, KELLY = 'Settings!$B$5', 'Settings!$B$6', 'Settings!$B$7'
band(st, 9, 'STANDARD PAYOUTS (used only when you leave the app multiplier blank, and for Top Entries)', 5)
hdr(st, 10, ['Legs', 'Power: all hit', 'Flex: all hit', 'Flex: 1 miss', 'Flex: 2 misses'])
for i, r in enumerate([[2, 3, None, None, None], [3, 5, 2.25, 1.25, 0], [4, 10, 5, 1.5, 0], [5, 20, 10, 2, 0.4], [6, 37.5, 25, 2, 0.4]], 11):
    put(st, f'A{i}', r[0])
    for j, v in enumerate(r[1:], 2): inp(st, f'{CL(j)}{i}', v, '0.00"x"')
put(st, 'A17', "PrizePicks payouts change with the lines you pick and with promos, so always type the app's 'To Win' multiplier into the Entry Builder. These defaults are a fallback.", italic=True, color='595959')
PAYR = 'Settings!$A$11:$A$15'
def pay(col, n): return f'INDEX(Settings!${col}$11:${col}$15,MATCH({n},{PAYR},0))'
for col, w in zip('ABCDE', [30, 14, 90, 14, 15]): st.column_dimensions[col].width = w

# ---------------- Sims (hidden) ----------------
keys = list(dict.fromkeys(f'{p} | {s}' for p, s in zip(L['player'], L['stat'])))
sims = wb.create_sheet('Sims')
for j, k in enumerate(keys, 1): sims.cell(1, j, k)
arr = np.array([np.asarray(S[tuple(k.split(' | '))])[:NS] for k in keys]).T.round().astype(int)
for i, row in enumerate(arr, 2):
    for j, v in enumerate(row, 1): sims.cell(i, j, int(v))
LAST = CL(len(keys)); SIMR = f'Sims!$A$2:${LAST}${NS + 1}'

# ---------------- Lists (hidden): dropdown sources ----------------
li = wb.create_sheet('Lists')
team_of = dict(zip(L['player'], L['team'])); book_of = {(p, s): l for p, s, l in zip(L['player'], L['stat'], L['line'])}
players = sorted(team_of)
li['A1'] = 'Players'
for i, p in enumerate(players, 2): li.cell(i, 1, p)
ps = sorted({(p, s) for p, s in zip(L['player'], L['stat'])}, key=lambda x: (x[0], STAT_ORDER.index(x[1]) if x[1] in STAT_ORDER else 99))
li['C1'] = 'Player'; li['D1'] = 'Stat'
for i, (p, s) in enumerate(ps, 2): li.cell(i, 3, p); li.cell(i, 4, s)
lines = []
for (p, s) in ps:
    lad = set(R[(R['Player'] == p) & (R['Stat'] == s)]['Line'].tolist()); lad.add(book_of[(p, s)])
    lines += [(f'{p} | {s}', x) for x in sorted(lad)]
li['F1'] = 'Key'; li['G1'] = 'Line'
for i, (k, x) in enumerate(lines, 2): li.cell(i, 6, k); li.cell(i, 7, float(x))
li['I1'] = 'Key'; li['J1'] = 'Team'; li['K1'] = 'Book line'
for i, (p, s) in enumerate(ps, 2): li.cell(i, 9, f'{p} | {s}'); li.cell(i, 10, team_of[p]); li.cell(i, 11, float(book_of[(p, s)]))
for i, v in enumerate(['More', 'Less'], 2): li.cell(i, 13, v)
li['M1'] = 'Side'; li['O1'] = 'Free'; li['O2'] = 'Yes'; li['Q1'] = 'Play'; li['Q2'] = 'Power'; li['Q3'] = 'Flex'
NP, NPS, NLN = len(players) + 1, len(ps) + 1, len(lines) + 1
from collections import Counter
MAXS = max(Counter(p for p, _ in ps).values()); MAXL = max(Counter(k for k, _ in lines).values())
STATC0, LINEC0 = 20, 28      # Lists columns T.. (stats for legs 1-6) and AB.. (lines for legs 1-6)
for i in range(6):
    r = 7 + i; sc, lc = CL(STATC0 + i), CL(LINEC0 + i)
    li[f'{sc}1'] = f'Leg {i+1} stats'; li[f'{lc}1'] = f'Leg {i+1} lines'
    for j in range(1, MAXS + 1):
        li[f'{sc}{j+1}'] = (f"=IF({j}<=COUNTIF($C$2:$C${NPS},'Entry Builder'!$B${r}),"
                           f"INDEX($D$2:$D${NPS},MATCH('Entry Builder'!$B${r},$C$2:$C${NPS},0)+{j-1}),\"\")")
    for j in range(1, MAXL + 1):
        li[f'{lc}{j+1}'] = (f"=IF({j}<=COUNTIF($F$2:$F${NLN},'Entry Builder'!$K${r}),"
                           f"INDEX($G$2:$G${NLN},MATCH('Entry Builder'!$K${r},$F$2:$F${NLN},0)+{j-1}),\"\")")

# ---------------- Entry Builder ----------------
eb = wb.create_sheet('Entry Builder'); EBn = "'Entry Builder'"
put(eb, 'A1', 'Entry Builder', bold=True, size=16)
put(eb, 'A2', "Pick each leg from the dropdowns (Player, then Stat, then More/Less, then Line). Type the app's multiplier. The verdict updates instantly.", italic=True)
put(eb, 'A3', 'Yellow = you fill in. Lines: pick from the list or type the PrizePicks line if it differs. Free space = a promo leg (counted as 99%).', italic=True, color='595959')
band(eb, 5, 'YOUR LEGS', 8)
hdr(eb, 6, ['Leg', 'Player', 'Stat', 'More / Less', 'Line', 'Free space?', 'Book line', 'Chance it hits'])
dvP = DataValidation(type='list', formula1=f'=Lists!$A$2:$A${NP}', allow_blank=True)
dvSide = DataValidation(type='list', formula1=f'=Lists!$M$2:$M$3', allow_blank=True)
dvFree = DataValidation(type='list', formula1=f'=Lists!$O$2:$O$2', allow_blank=True)
for dv in (dvP, dvSide, dvFree): eb.add_data_validation(dv)
R0 = 7; RN = R0 + NLEG - 1; rng = lambda col: f'${col}${R0}:${col}${RN}'
for i in range(NLEG):
    r = R0 + i
    put(eb, f'A{r}', i + 1, bold=True).alignment = Alignment(horizontal='center')
    for col in 'BCDEF': inp(eb, f'{col}{r}')
    eb[f'E{r}'].number_format = '0.0'
    dvP.add(f'B{r}'); dvSide.add(f'D{r}'); dvFree.add(f'F{r}')
    # per-leg choice lists live on Lists (plain ranges work in Excel AND Google Sheets; OFFSET-based lists don't in Google)
    sc, lc = CL(STATC0 + i), CL(LINEC0 + i)
    dvS = DataValidation(type='list', formula1=f'=Lists!${sc}$2:${sc}${MAXS+1}', allow_blank=True)
    dvL = DataValidation(type='list', formula1=f'=Lists!${lc}$2:${lc}${MAXL+1}', allow_blank=True, errorStyle='warning',
                         error='Not one of the report lines - fine if this is the PrizePicks line.', errorTitle='Custom line', showErrorMessage=True)
    eb.add_data_validation(dvS); eb.add_data_validation(dvL); dvS.add(f'C{r}'); dvL.add(f'E{r}')
    # helpers (columns K-S, hidden)
    eb[f'K{r}'] = f'=IF(OR(B{r}="",C{r}=""),"",B{r}&" | "&C{r})'
    eb[f'L{r}'] = f'=IF(K{r}="",0,IFERROR(MATCH(K{r},Sims!$1:$1,0),0))'
    eb[f'M{r}'] = f'=IF(AND(L{r}>0,D{r}<>"",E{r}<>""),1,0)'
    eb[f'N{r}'] = f'=IF(AND(M{r}=1,F{r}<>"Yes"),1,0)'
    eb[f'O{r}'] = f'=IF(K{r}="","",IFERROR(INDEX(Lists!$J$2:$J${NPS},MATCH(K{r},Lists!$I$2:$I${NPS},0)),""))'
    eb[f'P{r}'] = f'=IF(C{r}="Pass Yds","QBY",IF(C{r}="Pass TDs","QBTD",IF(OR(C{r}="Rec Yds",C{r}="Receptions",C{r}="Rush+Rec Yds"),"REC",IF(C{r}="Anytime TDs","TD","OTHER"))))'
    eb[f'Q{r}'] = (f'=IF(N{r}=0,1,IF(P{r}="QBY",CHOOSE(MIN(COUNTIFS({rng("O")},O{r},{rng("P")},"REC",{rng("D")},D{r},{rng("N")},1),3)+1,1,1,0.95,0.9),'
                   f'IF(AND(P{r}="QBTD",D{r}="More",COUNTIFS({rng("O")},O{r},{rng("P")},"TD",{rng("D")},"More",{rng("N")},1)>=1),0.9,1)))')
    eb[f'R{r}'] = f'=IF(N{r}=1,MAX(H{r}-{HAIR},0.01),"")'
    eb[f'S{r}'] = f'=IF(N{r}=1,R{r}/H{r},1)'
    # visible lookups
    put(eb, f'G{r}', f'=IF(K{r}="","",IFERROR(INDEX(Lists!$K$2:$K${NPS},MATCH(K{r},Lists!$I$2:$I${NPS},0)),""))', '0.0', color='595959')
    put(eb, f'H{r}', f'=IF(M{r}=0,"",IF(F{r}="Yes",0.99,IF(D{r}="Less",COUNTIF(INDEX({SIMR},0,L{r}),"<"&E{r}),COUNTIF(INDEX({SIMR},0,L{r}),">"&E{r}))/{NS}))', '0.0%', bold=True)
for col, t in zip('KLMNOPQRS', ['key', 'sim col', 'used', 'live', 'team', 'type', 'stack x', 'after cut', 'cut ratio']): eb[f'{col}{R0-1}'] = t
# Calc (hidden): one row per simulated game, 1 = that leg hits (unused/free legs count as hits)
calc = wb.create_sheet('Calc')
for j in range(NLEG): calc.cell(1, j + 1, f'Leg {j+1}')
calc.cell(1, 7, 'Misses')
for s in range(NS):
    rr = s + 2
    for j in range(NLEG):
        r = R0 + j
        calc.cell(rr, j + 1, f"=IF({EBn}!$N${r}=0,1,IF({EBn}!$D${r}=\"Less\",--(INDEX(Sims!$A{rr}:${LAST}{rr},{EBn}!$L${r})<{EBn}!$E${r}),--(INDEX(Sims!$A{rr}:${LAST}{rr},{EBn}!$L${r})>{EBn}!$E${r})))")
    calc.cell(rr, 7, f'={NLEG}-SUM(A{rr}:F{rr})')
CM = f'Calc!$G$2:$G${NS+1}'

band(eb, 14, 'YOUR PAYOUT', 8)
rows_pay = [(15, 'Play type', 'Power', None, 'Power = every leg must hit. Flex = partial payouts (3+ legs).'),
            (16, "App multiplier if ALL legs hit ('To Win')", None, '0.00"x"', 'From the app, e.g. 5.25. Blank = standard payout (less accurate).'),
            (17, 'Flex only: multiplier with 1 miss', None, '0.00"x"', 'From the app when Flex is selected.'),
            (18, 'Flex only: multiplier with 2 misses', None, '0.00"x"', '5-6 leg Flex only.'),
            (19, 'Your bankroll ($) - optional', None, '$#,##0', 'Money set aside for betting. Used only for the suggested stake.')]
dvPlay = DataValidation(type='list', formula1='=Lists!$Q$2:$Q$3', allow_blank=False); eb.add_data_validation(dvPlay)
for r, lab, v, fmt, note in rows_pay:
    put(eb, f'A{r}', lab, bold=True); eb.merge_cells(f'A{r}:C{r}'); inp(eb, f'D{r}', v, fmt); put(eb, f'E{r}', note, italic=True, color='595959', size=9)
dvPlay.add('D15')
# core numbers (hidden helpers in K20:K40, labelled in J)
H = {}
def helper(row, label, formula, fmt=None):
    eb[f'J{row}'] = label; c = eb[f'K{row}']; c.value = formula
    if fmt: c.number_format = fmt
    H[label] = f'$K${row}'
helper(21, 'legs used', f'=SUM({rng("M")})')
helper(22, 'live legs', f'=SUM({rng("N")})')
helper(23, 'free legs', f'=K21-K22')
helper(24, 'all hit raw', f'=IF(K21<1,"",COUNTIF({CM},0)/{NS})', '0.0%')
helper(25, 'one miss raw', f'=IF(K21<1,"",COUNTIF({CM},1)/{NS})', '0.0%')
helper(26, 'two miss raw', f'=IF(K21<1,"",COUNTIF({CM},2)/{NS})', '0.0%')
helper(27, 'stack factor', f'=PRODUCT({rng("Q")})', '0.00')
helper(28, 'cut factor', f'=PRODUCT({rng("S")})', '0.000')
helper(29, 'independent', f'=IF(K21<1,"",PRODUCT({rng("H")}))', '0.0%')
helper(30, 'all hit', f'=IF(K21<1,"",K24*K27*K28*0.99^K23)', '0.0%')
helper(31, 'default payout', f'=IFERROR(IF(D15="Flex",{pay("C","K21")},{pay("B","K21")}),"")', '0.00"x"')
helper(32, 'payout', f'=IF(D16<>"",D16,K31)', '0.00"x"')
helper(33, 'power EV', f'=IF(OR(K21<2,K32=""),"",K30*K32-1)', '+0.0%;-0.0%')
helper(38, 'flex 1-miss pay', f'=IF(D17<>"",D17,IFERROR({pay("D","K21")},0))', '0.00"x"')
helper(39, 'flex 2-miss pay', f'=IF(D18<>"",D18,IFERROR({pay("E","K21")},0))', '0.00"x"')
helper(34, 'flex EV', f'=IF(OR(K21<3,K32=""),"",K30*K32+K25*K38+K26*K39-1)', '+0.0%;-0.0%')
helper(35, 'EV', f'=IF(D15="Flex",K34,K33)', '+0.0%;-0.0%')
helper(36, 'cushion', f'=K22*{CUSH}', '0%')
helper(40, 'rule breaks', f'=(SUMPRODUCT(({rng("B")}<>"")*(COUNTIF({rng("B")},{rng("B")})>1))>0)+AND(K21>=2,SUMPRODUCT(({rng("O")}<>"")/COUNTIF({rng("O")},{rng("O")}&""))=1)+(COUNTIFS({rng("C")},"Anytime TDs",{rng("D")},"Less")>0)')
helper(37, 'stake', f'=IF(OR(D19="",K35="",K32=""),"",IF(OR(K35<K36,K35<=0,K40>0),0,FLOOR(D19*{KELLY}*K35/(K32-1),0.25)))', '$#,##0.00')
for r in range(21, 41): eb[f'J{r}'].font = GREY; eb[f'K{r}'].font = GREY

band(eb, 21, 'THE DECISION', 8)
verdict = ('=IF(K21<2,"Add at least 2 legs",IF(K40>0,"FIX LEGS",IF(AND(D15="Flex",K21<3),"Flex needs 3+ legs",IF(K35="","Enter the multiplier",'
           'IF(K35<=0,"SKIP",IF(K35<K36,"SKIP","PLAY"))))))')
put(eb, 'A22', 'Verdict', bold=True, size=13); c = put(eb, 'C22', verdict, bold=True, size=16); eb.merge_cells('C22:E22'); c.alignment = Alignment(horizontal='center')
reason = ('=IF(K21<2,"",IF(K40>0,"This entry breaks a PrizePicks rule - see CHECKS below.",IF(K35="","",IF(K35<=0,"Loses money on average ("&TEXT(K35,"+0%;-0%")&" per $1).",'
          'IF(K35<K36,"Positive ("&TEXT(K35,"+0%")&") but below the "&TEXT(K36,"+0%")&" cushion for "&K22&" live legs. Too thin to trust.",'
          '"Clears the "&TEXT(K36,"+0%")&" cushion with "&TEXT(K35,"+0%")&" expected profit per $1.")))))&IF(D16="",IF(K21>=2," Using the STANDARD payout - type the app multiplier.",""),"")')
c = put(eb, 'A23', reason, italic=True); eb.merge_cells('A23:H23'); c.alignment = Alignment(wrap_text=True, vertical='top'); eb.row_dimensions[23].height = 30
out = [(25, 'Chance ALL legs hit', '=K30', '0.0%', 'Includes how the legs move together, stack corrections, and the safety cut.'),
       (26, 'Break-even (chance needed)', '=IF(K32="","",IF(D15="Flex","see EV (Flex pays partial wins)",1/K32))', '0.0%', '1 / payout. The entry must hit at least this often.'),
       (27, 'Expected profit per $1 (EV)', '=K35', '+0.0%;-0.0%', 'Average over many entries like this - not tonight.'),
       (28, 'Cushion needed', '=IF(K21<2,"",K36)', '+0%', '5% per live leg (Settings). Free spaces do not count.'),
       (29, 'Suggested stake', '=IF(D19="","add bankroll",K37)', '$#,##0.00', 'Quarter-Kelly. $0 unless the verdict is PLAY.'),
       (30, 'Chance this entry loses', '=IF(K30="","",IF(D15="Flex",1-K30-K25*(K38>0)-K26*(K39>0),1-K30))', '0.0%', 'Losing streaks are normal even when EV is positive.')]
for r, lab, f, fmt, note in out:
    put(eb, f'A{r}', lab, bold=True); eb.merge_cells(f'A{r}:C{r}'); c = put(eb, f'D{r}', f, fmt, bold=True, size=12); c.border = BOX
    put(eb, f'E{r}', note, italic=True, color='595959', size=9)
band(eb, 32, 'CHECKS', 8)
checks = [(33, f'=IF(SUMPRODUCT(({rng("B")}<>"")*(COUNTIF({rng("B")},{rng("B")})>1))>0,"Same player picked twice - PrizePicks does not allow that.","")'),
          (34, f'=IF(AND(K21>=2,SUMPRODUCT(({rng("O")}<>"")/COUNTIF({rng("O")},{rng("O")}&""))=1),"All legs are from one team - PrizePicks needs at least 2 teams.","")'),
          (35, f'=IF(COUNTIFS({rng("C")},"Anytime TDs",{rng("D")},"Less")>0,"Anytime TD Less is not offered on PrizePicks (More only).","")'),
          (36, f'=IF(SUMPRODUCT(({rng("B")}<>"")*(1-{rng("M")}))>0,"A leg is missing its stat, side or line - it is being ignored.","")'),
          (37, '=IF(K27<1,"Stack correction applied: x"&TEXT(K27,"0.00")&" (the model slightly overrates QB + his receivers going the same way).","")')]
for r, f in checks:
    c = put(eb, f'A{r}', f, color='C00000'); eb.merge_cells(f'A{r}:H{r}')
put(eb, 'A38', '=IF(AND(K21>=2,K40=0),"No PrizePicks rule problems found.","")', color='006100', bold=True); eb.merge_cells('A38:H38')
band(eb, 39, 'SHOW THE MATH', 8)
pct = lambda ref: f'TEXT({ref},"0.0%")'
leg_list = '&'.join([f'IF(H{R0+i}="","",{"" if i == 0 else chr(34)+" x "+chr(34)+"&"}{pct(f"H{R0+i}")})' for i in range(NLEG)])
math = [(40, '1. If the legs were unrelated, multiply them', f'=IF(K21<2,"",{leg_list}&" = "&{pct("K29")})'),
        (41, '2. Simulated together (they move as a group)', f'=IF(K21<2,"",{pct("K24")}&IF(K23>0," (free space counted as a sure hit)","")&"  = x"&TEXT(K24/K29,"0.00")&" vs unrelated")'),
        (42, '3. Stack correction and safety cut', f'=IF(K21<2,"",{pct("K24")}&" x "&TEXT(K27,"0.00")&" x "&TEXT(K28,"0.000")&IF(K23>0," x 0.99","")&" = "&{pct("K30")})'),
        (43, '4. Break-even', '=IF(K32="","","1 / "&TEXT(K32,"0.00")&"x = "&TEXT(1/K32,"0.0%"))'),
        (44, '5. Expected profit (EV)', f'=IF(K33="","",IF(D15="Flex","Flex: "&{pct("K30")}&" x "&TEXT(K32,"0.00")&" + "&{pct("K25")}&" x "&TEXT(K38,"0.00")&" + "&{pct("K26")}&" x "&TEXT(K39,"0.00")&" - 1 = "&TEXT(K34,"+0%;-0%"),{pct("K30")}&" x "&TEXT(K32,"0.00")&" - 1 = "&TEXT(K33,"+0%;-0%")))'),
        (45, '6. Cushion', '=IF(K21<2,"",K22&" live legs x "&TEXT(' + CUSH + ',"0%")&" = "&TEXT(K36,"+0%")&" needed")'),
        (46, '7. Stake', f'=IF(OR(D19="",K35=""),"(add a bankroll above)",IF(C22<>"PLAY","Verdict is not PLAY - no stake","$"&TEXT(D19,"#,##0")&" x "&TEXT({KELLY},"0.00")&" x "&TEXT(K35,"0.00")&" / ("&TEXT(K32,"0.00")&" - 1) = $"&TEXT(K37,"0.00")))')]
for r, lab, f in math:
    put(eb, f'A{r}', lab, bold=True); eb.merge_cells(f'A{r}:C{r}'); c = put(eb, f'D{r}', f); eb.merge_cells(f'D{r}:H{r}')
for col, w in zip('ABCDEFGH', [6, 24, 14, 15, 10, 12, 10, 14]): eb.column_dimensions[col].width = w
for col in 'JKLMNOPQRS': eb.column_dimensions[col].hidden = True
eb.freeze_panes = 'A7'
# verdict colouring
eb.conditional_formatting.add('C22:E22', FormulaRule(formula=['$C$22="PLAY"'], fill=GREEN, font=F(bold=True, size=16, color='006100')))
eb.conditional_formatting.add('C22:E22', FormulaRule(formula=['OR($C$22="SKIP",$C$22="FIX LEGS")'], fill=RED, font=F(bold=True, size=16, color='9C0006')))
eb.conditional_formatting.add('C22:E22', FormulaRule(formula=['AND($C$22<>"PLAY",$C$22<>"SKIP",$C$22<>"FIX LEGS")'], fill=AMBER))
eb.conditional_formatting.add('D27', CellIsRule(operator='greaterThan', formula=['0'], fill=GREEN))
eb.conditional_formatting.add('D27', CellIsRule(operator='lessThan', formula=['0'], fill=RED))
eb.conditional_formatting.add(f'H{R0}:H{RN}', ColorScaleRule(start_type='num', start_value=0.4, start_color='F8696B', mid_type='num', mid_value=0.5, mid_color='FFFFFF', end_type='num', end_value=0.65, end_color='63BE7B'))
# example: best entry of the most common size, standard payout left blank on purpose
ex = E[E['size'] == 4].sort_values('ev_power', ascending=False).iloc[0]
for i, leg in enumerate(ex['legs']):
    m = re.match(r'(.+?) \((\w+)\) (.+?) (More|Less) ([\d.]+)', leg.split('  [')[0])
    if m:
        eb[f'B{R0+i}'] = m.group(1); eb[f'C{R0+i}'] = m.group(3); eb[f'D{R0+i}'] = m.group(4); eb[f'E{R0+i}'] = float(m.group(5))

# ---------------- Top Entries ----------------
te = wb.create_sheet('Top Entries')
put(te, 'A1', 'Top Entries', bold=True, size=14)
put(te, 'A2', 'Best combinations at the book lines, at STANDARD payouts. Before playing, rebuild the one you like in the Entry Builder with the app multiplier and PrizePicks lines.', italic=True)
hdr(te, 4, ['Legs', 'All hit', 'Standard payout', 'EV', 'Cushion', 'Clears it?', 'Leg 1', 'Leg 2', 'Leg 3', 'Leg 4', 'Leg 5', 'Leg 6'])
r = 5
for size in range(2, 7):
    for e in E[E['size'] == size].sort_values('ev_power', ascending=False).head(5).itertuples():
        put(te, f'A{r}', size); put(te, f'B{r}', float(e.p_all), '0.0%')
        put(te, f'C{r}', f'={pay("B", f"A{r}")}', '0.0"x"'); put(te, f'D{r}', f'=B{r}*C{r}-1', '+0%;-0%', bold=True)
        put(te, f'E{r}', f'=A{r}*{CUSH}', '+0%'); put(te, f'F{r}', f'=IF(D{r}>=E{r},"Yes","No")', bold=True)
        for j, (leg, p) in enumerate(zip(e.legs, e.leg_probs)):
            m = re.match(r'(.+?) \((\w+)\) (.+?) (More|Less) ([\d.]+)', leg.split('  [')[0])
            txt = f'{m.group(1)} ({m.group(2)}) - {m.group(3)} {m.group(4)} {m.group(5)}  [{p:.0f}%]' if m else leg
            put(te, f'{CL(7+j)}{r}', txt, size=9)
        r += 1
    r += 1
te.conditional_formatting.add(f'F5:F{r}', CellIsRule(operator='equal', formula=['"Yes"'], fill=GREEN))
te.conditional_formatting.add(f'F5:F{r}', CellIsRule(operator='equal', formula=['"No"'], fill=RED))
te.conditional_formatting.add(f'D5:D{r}', CellIsRule(operator='lessThan', formula=['0'], font=F(color='C00000', bold=True)))
for col, w in zip('ABCDEF', [6, 9, 10, 8, 9, 10]): te.column_dimensions[col].width = w
for col in 'GHIJKL': te.column_dimensions[col].width = 40
te.freeze_panes = 'G5'

# ---------------- Payout Finder ----------------
# For a fixed number of legs, EV = all-hit x multiplier - 1, so the ranking never changes with the multiplier - what
# changes is which entries clear the PLAY bar. Rows = top entries per size (by all-hit, after corrections + safety cut),
# columns = multipliers in steps, cell = EV coloured green (PLAY) / amber (positive, below cushion) / red (loses).
pf = wb.create_sheet('Payout Finder')
put(pf, 'A1', 'Payout Finder', bold=True, size=14)
put(pf, 'A2', "Build an entry from this list in the app, read its multiplier, find that column: GREEN = PLAY, AMBER = positive but below the cushion, RED = loses.", italic=True)
put(pf, 'A3', "Shortcut: 'PLAY at' is the lowest multiplier where that entry clears the cushion. Lines are book lines - if PrizePicks shows a different line, check it in the Entry Builder.", italic=True, color='595959')
RANGES = {2: (2.0, 4.0, 0.25), 3: (3.5, 7.0, 0.25), 4: (6.0, 12.0, 0.25), 5: (12.0, 25.0, 0.5), 6: (20.0, 45.0, 1.0)}
row = 5; G0 = 5   # grid starts at column E
for size in range(2, 7):
    lo, hi, stp = RANGES[size]; mults = [round(lo + k * stp, 2) for k in range(int(round((hi - lo) / stp)) + 1)]
    band(pf, row, f'{size} LEGS', G0 + len(mults) - 1)
    put(pf, f'B{row}', 'Cushion', bold=True, color='FFFFFF', size=9); put(pf, f'C{row}', f'={size}*{CUSH}', '+0%', bold=True, color='FFFFFF'); cush_ref = f'$C${row}'
    put(pf, f'D{row}', f'{size}-leg entries  |  multipliers {lo:.2f}x to {hi:.2f}x, every {stp:g}x', bold=True, color='FFFFFF')
    row += 1; hdr(pf, row, ['#', 'PLAY at', 'All hit', 'Entry (book lines)'])
    for j, m in enumerate(mults):
        c = pf.cell(row, G0 + j, m); c.number_format = '0.00"x"'; c.font = F(bold=True, size=9); c.fill = SUB; c.border = BOX; c.alignment = Alignment(horizontal='center')
    hrow = row; row += 1
    es = E[E['size'] == size].copy()
    es['cut'] = [np.prod([max(p / 100 - 0.01, 0.01) / (p / 100) for p in lp]) for lp in es['leg_probs']]
    es = es.assign(adj=es['p_all'] * es['cut']).sort_values('adj', ascending=False)
    first = row
    for k, e in enumerate(es.itertuples(), 1):
        cutf = '*'.join(f'(MAX({p/100:.4f}-{HAIR},0.01)/{p/100:.4f})' for p in e.leg_probs)
        put(pf, f'A{row}', k, bold=True).alignment = Alignment(horizontal='center', vertical='top')
        put(pf, f'C{row}', f'={float(e.p_all):.5f}*{cutf}', '0.0%', bold=True).alignment = Alignment(vertical='top')
        put(pf, f'B{row}', f'=(1+{cush_ref})/C{row}', '0.00"x"', bold=True).alignment = Alignment(vertical='top')
        legs_txt = []
        for leg, p in zip(e.legs, e.leg_probs):
            mm = re.match(r'(.+?) \((\w+)\) (.+?) (More|Less) ([\d.]+)', leg.split('  [')[0])
            legs_txt.append(f'{mm.group(1)} ({mm.group(2)}) {mm.group(3)} {mm.group(4)} {mm.group(5)} [{p:.0f}%]' if mm else leg)
        c = put(pf, f'D{row}', '\n'.join(legs_txt), size=8); c.alignment = Alignment(wrap_text=True, vertical='top')
        for j in range(len(mults)):
            col = CL(G0 + j); put(pf, f'{col}{row}', f'=$C{row}*{col}${hrow}-1', '+0%;-0%', size=9).alignment = Alignment(horizontal='center', vertical='top')
        pf.row_dimensions[row].height = 11.5 * size + 4
        row += 1
    last = row - 1; grid = f'{CL(G0)}{first}:{CL(G0 + len(mults) - 1)}{last}'; tl = f'{CL(G0)}{first}'
    pf.conditional_formatting.add(grid, FormulaRule(formula=[f'{tl}>={cush_ref}'], fill=GREEN))
    pf.conditional_formatting.add(grid, FormulaRule(formula=[f'AND({tl}>0,{tl}<{cush_ref})'], fill=AMBER))
    pf.conditional_formatting.add(grid, FormulaRule(formula=[f'{tl}<=0'], fill=RED))
    row += 1
pf.column_dimensions['A'].width = 4; pf.column_dimensions['B'].width = 9; pf.column_dimensions['C'].width = 8; pf.column_dimensions['D'].width = 40
for j in range(G0, G0 + 30): pf.column_dimensions[CL(j)].width = 6.5
pf.freeze_panes = 'D5'

# ---------------- Best Legs & Player Lines ----------------
STEP = {'Pass Yds': 10, 'Pass TDs': 1, 'Receptions': 1, 'Anytime TDs': 1}
R['Steps from book'] = [round((ln - m) / STEP.get(s, 5 if m >= 25 else 2)) for ln, m, s in zip(R['Line'], R['Market line'], R['Stat'])]
R['Pick text'] = R['Pick'] + ' ' + R['Line'].map(lambda x: f'{x:g}')
def table_sheet(name, df, pct_cols, widths, tname, note):
    ws = wb.create_sheet(name); put(ws, 'A1', name, bold=True, size=14); put(ws, 'A2', note, italic=True)
    cols = list(df.columns)
    for j, c in enumerate(cols, 1): ws.cell(4, j, c)
    for i, row in enumerate(df.itertuples(index=False), 5):
        for j, v in enumerate(row, 1):
            c = ws.cell(i, j, None if (isinstance(v, float) and np.isnan(v)) else v); c.font = F()
            if cols[j - 1] in pct_cols: c.number_format = '0.0%'
    t = Table(displayName=tname, ref=f'A4:{CL(len(cols))}{len(df) + 4}'); t.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2', showRowStripes=True); ws.add_table(t)
    for j, w in enumerate(widths, 1): ws.column_dimensions[CL(j)].width = w
    ws.freeze_panes = 'A5'
    for pc in pct_cols:
        j = cols.index(pc) + 1
        ws.conditional_formatting.add(f'{CL(j)}5:{CL(j)}{len(df) + 4}', ColorScaleRule(start_type='num', start_value=0.5, start_color='FFFFFF', end_type='num', end_value=0.8, end_color='63BE7B'))
    return ws
bl = R[(R['Steps from book'].abs() <= 2) & ~((R['Stat'] == 'Anytime TDs') & (R['Pick'] == 'Less'))].sort_values('Confidence', ascending=False)
bl = bl[['Confidence', 'Pick text', 'Player', 'Team', 'Stat', 'Market line', 'Steps from book', 'Game']].rename(columns={'Pick text': 'Pick', 'Market line': 'Book line'})
table_sheet('Best Legs', bl, ['Confidence'], [12, 12, 22, 7, 14, 10, 15, 12], 'BestLegs',
            'Strongest picks within 2 steps of the book line (the lines PrizePicks usually posts). TD Less is left out - PrizePicks only offers More. Use the filter arrows.')
pl = R.sort_values(['Player', 'Stat', 'Line'])[['Player', 'Team', 'Stat', 'Line', 'Pick', 'Confidence', 'Market line', 'Steps from book', 'Game']].rename(columns={'Market line': 'Book line'})
table_sheet('Player Lines', pl, ['Confidence'], [22, 7, 14, 8, 8, 12, 10, 15, 12], 'PlayerLines',
            "Every line we priced for every player: filter Player and Stat to see his full ladder. 'Pick' is the side more likely to hit at that line.")

# ---------------- Injuries & Notes ----------------
inj = wb.create_sheet('Injuries & Notes'); put(inj, 'A1', 'Injuries & Notes', bold=True, size=14)
band(inj, 3, 'HANDLED IN THE MODEL (confirmed out - their work was given to teammates)', 5)
hdr(inj, 4, ['Team', 'Player', 'Share removed', 'Of team', 'Status'])
r = 5
for x in I['flags'].itertuples():
    for j, v in enumerate([x.team, x.player, x.recent_share / 100, x.kind, 'OUT - confirmed'], 1):
        c = inj.cell(r, j, v); c.font = F()
        if j == 3: c.number_format = '0.0%'
    r += 1
r += 1; band(inj, r, 'OTHER NEWS (not changed in the model)', 5); r += 1
hdr(inj, r, ['Team', 'Player', 'Status', 'Note']); r += 1
for x in I.get('notes', pd.DataFrame(columns=['team', 'player', 'status', 'note'])).itertuples():
    for j, v in enumerate([x.team, x.player, x.status, x.note], 1):
        c = inj.cell(r, j, v); c.font = F(); c.alignment = Alignment(wrap_text=True, vertical='top')
    r += 1
r += 1; band(inj, r, 'ABOUT THIS MODEL', 5); r += 1
about = ['Each player\'s chance at the book line comes from the sportsbooks (odds with their margin removed). The model adds the shape of each range and how legs move together.',
         'Correlations were tuned on 206 past games; stacks of QB + 2 or more of his receivers are scaled down 5-10% because the model still slightly overrates them.',
         'Yardage ranges are 5% narrower around the book line after testing on Week 3 sportsbook lines (results landed 51.5% in the middle 50%, 78.9% in the middle 80%).',
         'Anytime TD chances come from four major books. The model\'s own "2+ TDs" numbers are not reliable - ignore them.',
         'PrizePicks lines can differ from the book line. Always pick or type the PrizePicks line in the Entry Builder.']
for t in about:
    c = inj.cell(r, 1, '- ' + t); c.font = F(); inj.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5); c.alignment = Alignment(wrap_text=True, vertical='top'); inj.row_dimensions[r].height = 30; r += 1
for col, w in zip('ABCDE', [8, 26, 14, 70, 18]): inj.column_dimensions[col].width = w

# ---------------- Learn the Math ----------------
lm = wb.create_sheet('Learn the Math'); put(lm, 'A1', 'Learn the Math', bold=True, size=14)
band(lm, 3, 'THE FORMULAS', 10)
for i, t in enumerate(['1. Chance an entry hits = multiply the legs (55% x 55% = 30%). Legs from the same game that move together hit more often - the Entry Builder handles that.',
                       '2. Break-even = 1 / payout. A 5.25x payout needs the entry to hit 19.0% of the time.',
                       '3. EV (expected profit per $1) = chance it hits x payout - 1. Quick version: chance / break-even - 1.',
                       '4. Only bet with a cushion: at least +5% EV per live leg (Settings).',
                       '5. Stake = bankroll x 1/4 x EV / (payout - 1). Big EV does not mean bet big - big entries lose most nights.',
                       '6. Lift: 1.00 = legs unrelated, above 1 = they tend to hit together, below 1 = they get in each other\'s way.'], 4):
    lm.cell(i, 1, t).font = F()
band(lm, 11, 'CHEAT SHEET - EV IF EVERY LEG HITS THE SAME % (standard payouts from Settings)', 10)
cols = [('B', 2, 'P'), ('C', 3, 'P'), ('D', 3, 'F'), ('E', 4, 'P'), ('F', 4, 'F'), ('G', 5, 'P'), ('H', 5, 'F'), ('I', 6, 'P'), ('J', 6, 'F')]
hdr(lm, 12, ['Each leg hits'] + [f'{n}-leg {"Power" if t == "P" else "Flex"}' for _, n, t in cols])
for k, p in enumerate([x / 100 for x in range(50, 63)]):
    rr = 13 + k; put(lm, f'A{rr}', p, '0%', bold=True)
    for col, n, t in cols:
        if t == 'P': f = f'=$A{rr}^{n}*{pay("B", n)}-1'
        else: f = f'=$A{rr}^{n}*{pay("C", n)}+{n}*$A{rr}^{n-1}*(1-$A{rr})*{pay("D", n)}+{n*(n-1)//2}*$A{rr}^{n-2}*(1-$A{rr})^2*{pay("E", n)}-1'
        put(lm, f'{col}{rr}', f, '+0%;-0%')
put(lm, 'A26', 'Break-even per leg', bold=True)
for col, n, t in cols:
    if t == 'P': put(lm, f'{col}26', f'=(1/{pay("B", n)})^(1/{n})', '0.0%', bold=True)
lm.conditional_formatting.add('B13:J25', CellIsRule(operator='greaterThan', formula=['0.0000001'], fill=GREEN))
lm.conditional_formatting.add('B13:J25', CellIsRule(operator='lessThan', formula=['-0.0000001'], fill=RED))
lm.column_dimensions['A'].width = 16
for col in 'BCDEFGHIJ': lm.column_dimensions[col].width = 11

# ---------------- Start Here ----------------
sh = wb.create_sheet('Start Here', 0); put(sh, 'A1', TITLE, bold=True, size=16)
band(sh, 3, 'THE SLATE', 6); hdr(sh, 4, ['Game', 'Kickoff', 'Favorite', 'Total', 'Legs priced'])
kick = dict(zip(R['Game'], R['Kickoff']))
for i, g in enumerate(G.itertuples(), 5):
    game = f'{g.away} @ {g.home}'; m = float(g.home_exp_margin)
    fav = f'{g.home} -{abs(m):g}' if m > 0 else (f'{g.away} -{abs(m):g}' if m < 0 else 'Pick\'em')
    for j, v in enumerate([game, kick.get(game, ''), fav, float(g.total), int(((L['home'] == g.home) & (L['away'] == g.away)).sum())], 1): sh.cell(i, j, v).font = F()
r = 5 + len(G) + 1
band(sh, r, 'INJURIES AT A GLANCE (details on Injuries & Notes)', 6); r += 1
outs = ', '.join(dict.fromkeys(I['flags']['player'])) or 'none'
sh.cell(r, 1, f'Removed from the model: {outs}').font = F(bold=True); r += 1
for x in I.get('notes', pd.DataFrame(columns=['team', 'player', 'status', 'note'])).itertuples():
    sh.cell(r, 1, f'{x.player} ({x.team}) - {x.status}').font = F(); r += 1
r += 1; band(sh, r, 'HOW TO USE (4 steps)', 6); r += 1
for t in ['1. Scan Best Legs or Top Entries for ideas.',
          '2. Shortcut: Payout Finder lists the best entries per size and the multiplier each needs to be a PLAY.',
          '   Or build any entry in the Entry Builder: pick each leg from the dropdowns, using the PrizePicks line.',
          "3. Type the app's multiplier (and bankroll if you want a stake). Read the verdict: PLAY or SKIP.",
          '4. Log what you play so we can grade it.']:
    sh.cell(r, 1, t).font = F(); r += 1
r += 1; band(sh, r, 'TABS (click to jump)', 6); r += 1
for name, desc in [('Entry Builder', 'Build and check any entry: verdict, EV, stake, the math'), ('Payout Finder', 'Top entries by size with EV at every multiplier - find PLAY fast'), ('Top Entries', 'Best combinations at standard payouts'),
                   ('Best Legs', 'Strongest single picks near the book line'), ('Player Lines', "Every player's full ladder of lines"),
                   ('Injuries & Notes', 'Who is out and what the model assumes'), ('Learn the Math', 'Formulas and an EV cheat sheet'), ('Settings', 'Cushion, safety cut, stake size, standard payouts')]:
    c = sh.cell(r, 1, name); c.hyperlink = f"#'{name}'!A1"; c.font = F(color='0563C1', underline='single', bold=True); sh.cell(r, 2, desc).font = F(); r += 1
r += 1; band(sh, r, 'COLORS', 6); r += 1
for t, fill in [('Yellow = you fill in', IN), ('Green = good / clears the bar', GREEN), ('Red = bad / below the bar', RED)]:
    c = sh.cell(r, 1, t); c.fill = fill; c.font = F(); r += 1
for col, w in zip('ABCDE', [22, 50, 12, 8, 12]): sh.column_dimensions[col].width = w

# ---------------- order, colours, hide ----------------
order = ['Start Here', 'Entry Builder', 'Payout Finder', 'Top Entries', 'Best Legs', 'Player Lines', 'Injuries & Notes', 'Learn the Math', 'Settings', 'Sims', 'Lists', 'Calc']
wb._sheets = [wb[n] for n in order]
for n, col in zip(order, ['1F3864', '00B050', '00B050', '2E75B6', '2E75B6', '2E75B6', 'C00000', '7F7F7F', '7F7F7F']): wb[n].sheet_properties.tabColor = col
for n in ('Sims', 'Lists', 'Calc'): wb[n].sheet_state = 'hidden'
for n in ('Start Here', 'Entry Builder', 'Top Entries', 'Injuries & Notes', 'Learn the Math'):
    ws = wb[n]; ws.sheet_properties.pageSetUpPr.fitToPage = True; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
wb.active = 0
wb.save(OUT); print('saved', OUT, '|', len(keys), 'sim columns |', len(lines), 'dropdown lines')
