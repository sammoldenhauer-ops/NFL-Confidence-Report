-- §8 calibration_summary: all-time, strict view (pushes/voids and excluded rows are not counted).
-- The dashboard computes filtered/legacy variants from graded_props directly (src/lib/calibration.ts).
CREATE OR REPLACE VIEW calibration_summary AS
SELECT
  b.label AS bucket,
  COUNT(*)::int AS n,
  ROUND((100.0 * AVG(CASE WHEN g.hit THEN 1 ELSE 0 END))::numeric, 1) AS hit_rate,
  ROUND(AVG(p.confidence_pct)::numeric, 1) AS avg_confidence,
  ROUND((100.0 * AVG(CASE WHEN g.hit THEN 1 ELSE 0 END) - AVG(p.confidence_pct))::numeric, 1) AS gap
FROM graded_props g
JOIN props p ON p.id = g.prop_id
JOIN (VALUES
  ('<40%', 0, 40), ('40-50%', 40, 50), ('50-60%', 50, 60), ('60-70%', 60, 70),
  ('70-80%', 70, 80), ('80-90%', 80, 90), ('90-100%', 90, 100.0001)
) AS b(label, lo, hi) ON p.confidence_pct >= b.lo AND p.confidence_pct < b.hi
WHERE g.status IN ('hit', 'miss') AND g.exclude_from_calibration = false
GROUP BY b.label, b.lo
ORDER BY b.lo;
