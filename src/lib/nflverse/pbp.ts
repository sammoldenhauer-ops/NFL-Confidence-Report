// Aggregates nflverse play-by-play into per-player-per-game box scores keyed by gsis_id (§2, §5.1).

export type PbpRecord = Record<string, string | undefined>;

export type GameRow = {
  gameId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
};

export type PlayerGameRow = {
  playerId: string;
  gameId: string;
  season: number;
  week: number;
  team: string | null;
  passYds: number;
  passTd: number;
  rushYds: number;
  rushTd: number;
  rec: number;
  recYds: number;
  recTd: number;
  targets: number;
};

const num = (v: string | undefined): number => {
  if (v === undefined || v === "" || v === "NA") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const flag = (v: string | undefined): boolean => v === "1" || v === "1.0" || v === "TRUE";
const id = (v: string | undefined): string | null => (v && v !== "NA" && v.startsWith("00-") ? v : null);

export type PbpAggregate = { games: GameRow[]; playerGames: PlayerGameRow[] };

export async function aggregatePbp(records: AsyncIterable<PbpRecord> | Iterable<PbpRecord>): Promise<PbpAggregate> {
  const games = new Map<string, GameRow>();
  const pg = new Map<string, PlayerGameRow>();

  const get = (playerId: string, r: PbpRecord, team: string | null): PlayerGameRow => {
    const gameId = r.game_id!;
    const k = `${playerId}|${gameId}`;
    let row = pg.get(k);
    if (!row) {
      row = {
        playerId,
        gameId,
        season: Number(r.season),
        week: Number(r.week),
        team,
        passYds: 0,
        passTd: 0,
        rushYds: 0,
        rushTd: 0,
        rec: 0,
        recYds: 0,
        recTd: 0,
        targets: 0,
      };
      pg.set(k, row);
    }
    if (team && !row.team) row.team = team;
    return row;
  };

  for await (const r of records) {
    const gameId = r.game_id;
    if (!gameId) continue;
    if ((r.season_type ?? "REG") !== "REG") continue; // regular season only (§4 D excludes playoffs)

    if (!games.has(gameId)) {
      games.set(gameId, {
        gameId,
        season: Number(r.season),
        week: Number(r.week),
        homeTeam: r.home_team!,
        awayTeam: r.away_team!,
        homeScore: null,
        awayScore: null,
        completed: false,
      });
    }
    const g = games.get(gameId)!;
    if (r.home_score && r.home_score !== "NA" && r.away_score && r.away_score !== "NA") {
      g.homeScore = Number(r.home_score);
      g.awayScore = Number(r.away_score);
      g.completed = true;
    }

    const playType = r.play_type;
    if (playType !== "pass" && playType !== "run") continue; // also drops no_play, kickoffs, punts, etc.
    if (flag(r.two_point_attempt)) continue; // conversions are not counted in official box scores
    const team = r.posteam && r.posteam !== "NA" ? r.posteam : null;

    if (playType === "pass") {
      const passer = id(r.passer_player_id);
      const receiver = id(r.receiver_player_id);
      const sack = flag(r.sack);
      const complete = flag(r.complete_pass);
      if (passer && !sack) {
        const row = get(passer, r, team);
        if (complete) row.passYds += num(r.passing_yards);
        if (flag(r.pass_touchdown)) row.passTd += 1;
      }
      if (receiver && !sack) {
        const row = get(receiver, r, team);
        row.targets += 1;
        if (complete) {
          row.rec += 1;
          row.recYds += num(r.receiving_yards);
          if (flag(r.pass_touchdown)) row.recTd += 1;
        }
      }
    } else {
      const rusher = id(r.rusher_player_id);
      if (rusher) {
        const row = get(rusher, r, team);
        row.rushYds += num(r.rushing_yards);
        if (flag(r.rush_touchdown)) row.rushTd += 1;
      }
    }
  }

  return { games: [...games.values()], playerGames: [...pg.values()] };
}
