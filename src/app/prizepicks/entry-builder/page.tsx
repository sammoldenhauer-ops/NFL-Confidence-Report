import { loadSlate } from "../../../lib/slate-data";
import EntryBuilderClient from "./EntryBuilderClient";

export const dynamic = "force-dynamic";

export default async function EntryBuilderPage() {
  const slate = await loadSlate();
  const legs = (slate?.legs ?? []).map((l) => ({
    player: l.player,
    team: l.team,
    stat: l.stat,
    bookLine: l.book_line,
    ladder: l.ladder,
  }));
  return <EntryBuilderClient availableLegs={legs} />;
}
