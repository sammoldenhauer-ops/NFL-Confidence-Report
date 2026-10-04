import { loadSlate } from "../../../lib/slate-data";
import EntryInputClient from "./EntryInputClient";

export const dynamic = "force-dynamic";

export default async function EntryInputPage() {
  const slate = await loadSlate();
  const legs = (slate?.legs ?? []).map((l) => ({ player: l.player, team: l.team, stat: l.stat, ladder: l.ladder }));
  return <EntryInputClient availableLegs={legs} />;
}
