// Port of prizepicks-model/docs/ENTRY_MATH_SPEC.md. Keep this file's logic in lockstep with that doc - it is the
// source of truth, verified cell-by-cell against Python on the same simulation rows.

export type Side = "More" | "Less";
export type PlayType = "power" | "flex";

export type Leg = {
  player: string;
  team: string;
  stat: string;
  side: Side;
  line: number;
  free: boolean;
};

export type SlateSettings = {
  safety_cut: number;
  cushion_per_leg: number;
  kelly_fraction: number;
  free_space_chance: number;
};

export type StandardPayouts = {
  power: Record<string, number>;
  flex_all: Record<string, number>;
  flex_1miss: Record<string, number>;
  flex_2miss: Record<string, number>;
};

export type StackCorrections = {
  qb_pass_yds_plus_2_same_side_receiving: number;
  qb_pass_yds_plus_3plus: number;
  qb_pass_tds_more_plus_teammate_td_more: number;
};

export type SimsData = { n: number; keys: string[]; cols: number[][] };

export type LegResult = Leg & {
  type: "QBY" | "QBTD" | "REC" | "TD" | "OTHER";
  p: number;
  stackFactor: number;
  cutRatio: number;
  live: boolean;
};

export type Verdict = "ADD_LEGS" | "FIX_LEGS" | "FLEX_NEEDS_3" | "NEED_MULT" | "SKIP" | "PLAY";

export type EntryResult = {
  legResults: LegResult[];
  legsUsed: number;
  liveLegs: number;
  freeLegs: number;
  allRaw: number;
  oneRaw: number;
  twoRaw: number;
  independent: number;
  stackTotal: number;
  cutTotal: number;
  allHit: number;
  defaultPayout: number;
  payout: number | null;
  ev: number | null;
  breakEven: number | null;
  cushion: number;
  chanceLoses: number | null;
  ruleErrors: string[];
  verdict: Verdict;
  verdictReason: string;
  stake: number | null;
};

function statType(stat: string): LegResult["type"] {
  if (stat === "Pass Yds") return "QBY";
  if (stat === "Pass TDs") return "QBTD";
  if (stat === "Rec Yds" || stat === "Receptions" || stat === "Rush+Rec Yds") return "REC";
  if (stat === "Anytime TDs") return "TD";
  return "OTHER";
}

export function computeEntry(
  legs: (Leg | null)[],
  playType: PlayType,
  settings: SlateSettings,
  standardPayouts: StandardPayouts,
  stackCorrections: StackCorrections,
  sims: SimsData,
  opts: { mult?: number; mult1?: number; mult2?: number; bankroll?: number },
): EntryResult {
  const simsByKey = new Map<string, number[]>();
  sims.keys.forEach((k, i) => simsByKey.set(k, sims.cols[i]));
  const NS = sims.n;

  const used = legs.filter((l): l is Leg => l !== null);

  const partial: Array<Omit<LegResult, "stackFactor" | "cutRatio">> = used.map((leg) => {
    const key = `${leg.player} | ${leg.stat}`;
    const arr = simsByKey.get(key);
    const type = statType(leg.stat);
    const live = !leg.free;
    let p: number;
    if (leg.free) {
      p = settings.free_space_chance;
    } else if (!arr) {
      p = 0;
    } else {
      const hits = arr.reduce((acc, v) => acc + (leg.side === "Less" ? (v < leg.line ? 1 : 0) : v > leg.line ? 1 : 0), 0);
      p = hits / NS;
    }
    return { ...leg, type, p, live };
  });

  const legResults: LegResult[] = partial.map((leg) => {
    if (!leg.live) return { ...leg, stackFactor: 1, cutRatio: 1 };
    let stackFactor = 1;
    if (leg.type === "QBY") {
      const n = partial.filter((o) => o.live && o.team === leg.team && o.type === "REC" && o.side === leg.side).length;
      if (n >= 3) stackFactor = stackCorrections.qb_pass_yds_plus_3plus;
      else if (n === 2) stackFactor = stackCorrections.qb_pass_yds_plus_2_same_side_receiving;
    } else if (leg.type === "QBTD" && leg.side === "More") {
      const hasTeamTdMore = partial.some((o) => o.live && o.team === leg.team && o.type === "TD" && o.side === "More");
      if (hasTeamTdMore) stackFactor = stackCorrections.qb_pass_tds_more_plus_teammate_td_more;
    }
    const cutRatio = Math.max(leg.p - settings.safety_cut, 0.01) / leg.p;
    return { ...leg, stackFactor, cutRatio };
  });

  const legsUsed = legResults.length;
  const liveLegs = legResults.filter((l) => l.live).length;
  const freeLegs = legsUsed - liveLegs;

  let allCount = 0;
  let oneCount = 0;
  let twoCount = 0;
  for (let s = 0; s < NS; s++) {
    let misses = 6;
    for (const leg of legResults) {
      const key = `${leg.player} | ${leg.stat}`;
      const arr = simsByKey.get(key);
      const hit = !leg.live || (arr ? (leg.side === "Less" ? arr[s] < leg.line : arr[s] > leg.line) : false);
      if (hit) misses--;
    }
    if (misses === 0) allCount++;
    else if (misses === 1) oneCount++;
    else if (misses === 2) twoCount++;
  }
  const allRaw = allCount / NS;
  const oneRaw = oneCount / NS;
  const twoRaw = twoCount / NS;

  const independent = legResults.reduce((acc, l) => acc * l.p, 1);
  const stackTotal = legResults.reduce((acc, l) => acc * l.stackFactor, 1);
  const cutTotal = legResults.reduce((acc, l) => acc * l.cutRatio, 1);
  const allHit = allRaw * stackTotal * cutTotal * Math.pow(0.99, freeLegs);

  const ruleErrors: string[] = [];
  const playerCounts = new Map<string, number>();
  for (const l of legResults) playerCounts.set(l.player, (playerCounts.get(l.player) ?? 0) + 1);
  if ([...playerCounts.values()].some((c) => c > 1)) ruleErrors.push("Same player picked twice - PrizePicks does not allow that.");
  if (legsUsed >= 2 && new Set(legResults.map((l) => l.team)).size === 1) ruleErrors.push("All legs are from one team - PrizePicks needs at least 2 teams.");
  if (legResults.some((l) => l.type === "TD" && l.side === "Less")) ruleErrors.push("Anytime TD Less is not offered on PrizePicks (More only).");

  const defaultPayout = (playType === "flex" ? standardPayouts.flex_all : standardPayouts.power)[String(legsUsed)] ?? 0;
  const payout = opts.mult ?? (legsUsed >= 2 ? defaultPayout : null);
  const cushion = liveLegs * settings.cushion_per_leg;

  let ev: number | null = null;
  let breakEven: number | null = null;
  let chanceLoses: number | null = null;
  if (payout !== null) {
    if (playType === "power") {
      ev = allHit * payout - 1;
      breakEven = 1 / payout;
      chanceLoses = 1 - allHit;
    } else if (legsUsed >= 3) {
      const flexPay1 = opts.mult1 ?? standardPayouts.flex_1miss[String(legsUsed)] ?? 0;
      const flexPay2 = opts.mult2 ?? standardPayouts.flex_2miss[String(legsUsed)] ?? 0;
      ev = allHit * payout + oneRaw * flexPay1 + twoRaw * flexPay2 - 1;
      chanceLoses = 1 - allHit - (flexPay1 > 0 ? oneRaw : 0) - (flexPay2 > 0 ? twoRaw : 0);
    }
  }

  let verdict: Verdict;
  let verdictReason: string;
  if (legsUsed < 2) {
    verdict = "ADD_LEGS";
    verdictReason = "Add at least 2 legs";
  } else if (ruleErrors.length > 0) {
    verdict = "FIX_LEGS";
    verdictReason = ruleErrors[0];
  } else if (playType === "flex" && legsUsed < 3) {
    verdict = "FLEX_NEEDS_3";
    verdictReason = "Flex needs 3+ legs";
  } else if (ev === null) {
    verdict = "NEED_MULT";
    verdictReason = "Enter the multiplier";
  } else if (ev <= 0) {
    verdict = "SKIP";
    verdictReason = "Loses money on average (EV per $1).";
  } else if (ev < cushion) {
    verdict = "SKIP";
    verdictReason = `Positive but below the ${(cushion * 100).toFixed(0)}% cushion for ${liveLegs} live legs - too thin to trust.`;
  } else {
    verdict = "PLAY";
    verdictReason = `Clears the ${(cushion * 100).toFixed(0)}% cushion with ${(ev * 100).toFixed(1)}% expected profit per $1.`;
  }

  let stake: number | null = null;
  if (verdict === "PLAY" && opts.bankroll && payout !== null && ev !== null) {
    const raw = opts.bankroll * settings.kelly_fraction * (ev / (payout - 1));
    stake = Math.max(0, Math.floor(raw / 0.25) * 0.25);
  }

  return {
    legResults,
    legsUsed,
    liveLegs,
    freeLegs,
    allRaw,
    oneRaw,
    twoRaw,
    independent,
    stackTotal,
    cutTotal,
    allHit,
    defaultPayout,
    payout,
    ev,
    breakEven,
    cushion,
    chanceLoses,
    ruleErrors,
    verdict,
    verdictReason,
    stake,
  };
}
