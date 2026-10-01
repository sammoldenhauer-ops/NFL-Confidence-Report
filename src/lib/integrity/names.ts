// §5 item 2: duplicate-name detection on every player-share dataset.

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

const NICKNAMES: Record<string, string> = {
  kenny: "kenneth",
  mike: "michael",
  matt: "matthew",
  chris: "christopher",
  dj: "dj",
  tj: "tj",
  aj: "aj",
  cj: "cj",
  jk: "jk",
  rj: "rj",
  josh: "joshua",
  nick: "nicholas",
  will: "william",
  zach: "zachary",
  dan: "daniel",
  tom: "thomas",
  ben: "benjamin",
  alex: "alexander",
  tony: "anthony",
  jake: "jacob",
  tim: "timothy",
  drew: "andrew",
  andy: "andrew",
  bobby: "robert",
  rob: "robert",
  ricky: "richard",
  rick: "richard",
  jimmy: "james",
  jim: "james",
  jon: "jonathan",
  johnny: "john",
  steve: "steven",
  sam: "samuel",
};

export function normalizeName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`.\-]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (cleaned.length > 1 && SUFFIXES.has(cleaned[cleaned.length - 1])) cleaned.pop();
  if (cleaned.length > 0) cleaned[0] = NICKNAMES[cleaned[0]] ?? cleaned[0];
  return cleaned.join(" ");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export type NameCollision = {
  team: string;
  kind: "normalized-match" | "near-match";
  names: string[];
};

/** Flags same-team players whose normalized names match (or differ by one character). */
export function findNameCollisions(
  rows: ReadonlyArray<{ team: string | null | undefined; name: string }>,
): NameCollision[] {
  const byTeam = new Map<string, Set<string>>();
  for (const r of rows) {
    const team = r.team?.trim() || "(none)";
    if (!byTeam.has(team)) byTeam.set(team, new Set());
    byTeam.get(team)!.add(r.name);
  }
  const out: NameCollision[] = [];
  for (const [team, nameSet] of byTeam) {
    const names = [...nameSet];
    const keyed = names.map((n) => ({ n, key: normalizeName(n) }));
    const byKey = new Map<string, string[]>();
    for (const { n, key } of keyed) byKey.set(key, [...(byKey.get(key) ?? []), n]);
    for (const group of byKey.values()) {
      if (group.length > 1) out.push({ team, kind: "normalized-match", names: group });
    }
    const keys = [...byKey.keys()];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        if (levenshtein(keys[i], keys[j]) === 1 && keys[i].length >= 8) {
          out.push({ team, kind: "near-match", names: [...byKey.get(keys[i])!, ...byKey.get(keys[j])!] });
        }
      }
    }
  }
  return out;
}
