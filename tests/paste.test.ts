import { describe, expect, it } from "vitest";
import { parsePastedLines } from "../src/lib/data/paste";

describe("parsePastedLines", () => {
  it("parses pipe-delimited lines with an explicit side and odds", () => {
    const { lines, errors } = parsePastedLines("Trey McBride | rec | 3.5 | Over | -900\nJalen Hurts|rush_td|0.5|Over|-200");
    expect(errors).toHaveLength(0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ playerName: "Trey McBride", stat: "rec", line: 3.5, side: "over", odds: -900 });
    expect(lines[1]).toMatchObject({ playerName: "Jalen Hurts", stat: "rush_td", line: 0.5, odds: -200 });
  });

  it("defaults side to Over and odds to -110 when omitted", () => {
    const { lines } = parsePastedLines("Amon-Ra St. Brown, Receptions, 3.5");
    expect(lines[0]).toMatchObject({ playerName: "Amon-Ra St. Brown", stat: "rec", line: 3.5, side: "over", odds: -110 });
  });

  it("handles sportsbook-style tab paste with Under", () => {
    const { lines } = parsePastedLines("Christian Watson\trec_yds\t19.5\tUnder\t-120");
    expect(lines[0]).toMatchObject({ stat: "rec_yds", side: "under", odds: -120 });
  });

  it("reports unrecognized stats and missing numeric lines as errors, not silent drops", () => {
    const { lines, errors } = parsePastedLines("Some Guy | made-up-stat | 3.5\nAnother Guy | rec");
    expect(lines).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });

  it("skips blank lines and comments", () => {
    const { lines } = parsePastedLines("# header\n\nTrey McBride | rec | 3.5 | Over | -900\n");
    expect(lines).toHaveLength(1);
  });
});
