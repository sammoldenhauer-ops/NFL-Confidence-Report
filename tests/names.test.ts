import { describe, expect, it } from "vitest";
import { findNameCollisions, normalizeName } from "../src/lib/integrity/names";

describe("§5.2 duplicate-name detection (real season examples)", () => {
  it("normalizes apostrophes, periods, suffixes, nicknames", () => {
    expect(normalizeName("Ja'Kobi Lane")).toBe(normalizeName("Jakobi Lane"));
    expect(normalizeName("Chris Godwin")).toBe(normalizeName("Chris Godwin Jr."));
    expect(normalizeName("Kenneth Gainwell")).toBe(normalizeName("Kenny Gainwell"));
    expect(normalizeName("Amon-Ra St. Brown")).not.toBe(normalizeName("A.J. Brown"));
  });

  it("flags same-team collisions, not cross-team ones", () => {
    const c = findNameCollisions([
      { team: "TB", name: "Chris Godwin" },
      { team: "TB", name: "Chris Godwin Jr." },
      { team: "LV", name: "Mike Washington" },
      { team: "LV", name: "Mike Washington Jr." },
      { team: "LA", name: "Konata Mumfield" },
      { team: "LA", name: "Konata Mumpfield" },
      { team: "DET", name: "Amon-Ra St. Brown" },
      { team: "NE", name: "A.J. Brown" },
    ]);
    expect(c.map((x) => x.team).sort()).toEqual(["LA", "LV", "TB"]);
  });
});
