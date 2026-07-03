// Client-side cohort-diff + lift engine (PRD Epic 2, S2.1/S2.2).
// Runs the same "split journeys by a predicate, compute per-signal lift" operation
// the pipeline does — used by the custom cohort builder and to ground the agent.

export const rate = (rows) =>
  rows.length ? rows.filter((r) => r.converted).length / rows.length : 0

// the comparable signals available on every journey (the substrate vocabulary)
export const SIGNALS = [
  { key: 'reached_proof', label: 'reaches proof (scroll ≥20%)', test: (j) => j.max_scroll_pct >= 20 },
  { key: 'reached_testimonials', label: 'reaches testimonials (≥45%)', test: (j) => j.reached_testimonials },
  { key: 'reached_cta', label: 'reaches CTA (≥90%)', test: (j) => j.max_scroll_pct >= 90 },
  { key: 'returning', label: 'returns (2+ visits)', test: (j) => j.returning },
  { key: 'no_rage', label: 'no rage clicks', test: (j) => !j.rage_clicked },
  { key: 'desktop', label: 'on desktop', test: (j) => j.device === 'Desktop' },
  { key: 'high_intent', label: 'intent_score ≥ 75', test: (j) => j.intent_score >= 75 },
]

// fields you can build predicates over in the cohort builder
export const DIMENSIONS = [
  { key: 'device', label: 'Device', kind: 'enum' },
  { key: 'landing_page', label: 'Landing page', kind: 'enum' },
  { key: 'campaign', label: 'Campaign', kind: 'enum' },
  { key: 'search_term', label: 'Search term', kind: 'enum' },
  { key: 'engagement_archetype', label: 'Archetype', kind: 'enum' },
  { key: 'quality_tier', label: 'Quality tier', kind: 'enum' },
  { key: 'converted', label: 'Converted', kind: 'bool' },
  { key: 'returning', label: 'Returning', kind: 'bool' },
  { key: 'rage_clicked', label: 'Rage clicked', kind: 'bool' },
  { key: 'reached_testimonials', label: 'Reached testimonials', kind: 'bool' },
  { key: 'max_scroll_pct', label: 'Max scroll %', kind: 'num' },
  { key: 'intent_score', label: 'Intent score', kind: 'num' },
  { key: 'visit_count', label: 'Visit count', kind: 'num' },
]

const OPS = {
  '=': (a, b) => String(a) === String(b),
  '≠': (a, b) => String(a) !== String(b),
  '≥': (a, b) => Number(a) >= Number(b),
  '≤': (a, b) => Number(a) <= Number(b),
  'is true': (a) => !!a,
  'is false': (a) => !a,
}

export const matchPredicate = (j, p) => {
  const v = j[p.field]
  const fn = OPS[p.op]
  return fn ? fn(v, p.value) : true
}
export const matchAll = (j, preds) => preds.every((p) => matchPredicate(j, p))

// distinct values for an enum dimension, by volume
export const distinctValues = (journeys, field, limit = 30) => {
  const c = {}
  journeys.forEach((j) => {
    const v = j[field]
    if (v === null || v === undefined || v === '') return
    c[v] = (c[v] || 0) + 1
  })
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k)
}

// diff cohort A vs cohort B across all signals, ranked by lift
export function diffCohorts(A, B) {
  const rows = SIGNALS.map((s) => {
    const aIn = A.filter(s.test)
    const bIn = B.filter(s.test)
    return {
      signal: s.label,
      key: s.key,
      a_share: A.length ? aIn.length / A.length : 0,
      b_share: B.length ? bIn.length / B.length : 0,
      lift: B.length && bIn.length ? (aIn.length / A.length) / (bIn.length / B.length) : 0,
    }
  })
  return rows.sort((x, y) => y.lift - x.lift)
}

// summarize a single cohort
export const summarize = (rows) => ({
  n: rows.length,
  cvr: rate(rows),
  converted: rows.filter((r) => r.converted).length,
  avg_scroll: rows.length ? Math.round(rows.reduce((s, r) => s + r.max_scroll_pct, 0) / rows.length) : 0,
  mobile: rows.length ? rows.filter((r) => r.device === 'Mobile').length / rows.length : 0,
})
