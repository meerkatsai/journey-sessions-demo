// Epic 9 — the conversational agent.
// Default: a deterministic engine grounded in the substrate (queries the signal/journey
// layer, never raw events; answers with real numbers + evidence + can spawn a finding).
// Optional: upgrade to full NL via the Claude API when a key is provided.
import { rate, diffCohorts, summarize } from './engine.js'
import { pct, fmt, inr } from './format.js'

const pickPage = (data, q) => {
  const pages = data.converter_diff.map((d) => d.page)
  const hit = pages.find((p) => q.includes(p.replace(/^\//, '').split('-')[0]) && q.includes(p.split('-')[1] || '###'))
  return data.converter_diff.find((d) => pages.includes(hit)) ||
    data.converter_diff.find((d) => q.replace(/[^a-z]/g, '').includes(d.page.replace(/[^a-z]/g, '').slice(1, 8)))
}

// The grounded engine. Returns { text, evidence?, diff?, rec? }.
export function groundedAnswer(question, data) {
  const q = question.toLowerCase()
  const J = data.journeys
  const conv = J.filter((j) => j.converted)
  const nonconv = J.filter((j) => !j.converted)

  // 0) device is checked first so an explicit "mobile"/"desktop" mention wins
  if (/\b(mobile|desktop|device|phone)\b/.test(q)) {
    const m = J.filter((j) => j.device === 'Mobile')
    const d = J.filter((j) => j.device === 'Desktop')
    return {
      text: `Mobile is ${pct(m.length / J.length, 0)} of paid clicks (${fmt(m.length)} visitors) and converts at ${pct(rate(m))}, vs desktop at ${pct(rate(d))} (${fmt(d.length)} visitors). Mobile scroll depth averages ${Math.round(m.reduce((s, j) => s + j.max_scroll_pct, 0) / m.length)}% — the hero is taller than one mobile screen, so most never reach the proof block. That's why they bounce: they decide before they see the evidence.`,
      evidence: data.evidence.filter((e) => e.duration_s < 30).slice(0, 3),
      rec: data.recommendations.find((r) => r.finding.signal === 'reached_proof'),
    }
  }
  // 1) what separates converters?
  if (/(separate|differ|converter|convert).*(non|bounce|didn|vs)|what did converters/.test(q) ||
      /why.*(bounce|leave|drop|not convert)/.test(q)) {
    const diff = diffCohorts(conv, nonconv).filter((d) => d.lift > 1).slice(0, 4)
    const top = diff[0]
    return {
      text: `Across ${fmt(J.length)} resolved journeys, the signals that most separate the ${fmt(conv.length)} converters from the ${fmt(nonconv.length)} non-converters, ranked by lift:`,
      diff,
      followup: `The biggest gap is **${top.signal}** (${top.lift.toFixed(1)}× more common in converters). ${pct(nonconv.filter(SIGtest(top.key)).length / nonconv.length, 0)} of non-converters never hit it — that's where the funnel leaks.`,
      evidence: data.evidence.slice(0, 3),
      rec: data.recommendations.find((r) => r.finding.signal === top.key),
    }
  }
  // 2) mobile vs desktop
  if (/mobile|desktop|device/.test(q)) {
    const m = J.filter((j) => j.device === 'Mobile')
    const d = J.filter((j) => j.device === 'Desktop')
    return {
      text: `Mobile is ${pct(m.length / J.length, 0)} of paid clicks (${fmt(m.length)} visitors) and converts at ${pct(rate(m))}, vs desktop at ${pct(rate(d))} (${fmt(d.length)} visitors). Mobile scroll depth averages ${Math.round(m.reduce((s, j) => s + j.max_scroll_pct, 0) / m.length)}% — the hero is taller than one mobile screen, so most never reach proof.`,
      evidence: data.evidence.filter((e) => e.duration_s < 30).slice(0, 3),
    }
  }
  // 3) scroll / hero / fold
  if (/scroll|hero|fold|above the fold|proof/.test(q)) {
    const past = J.filter((j) => j.max_scroll_pct >= 20)
    const hero = J.filter((j) => j.max_scroll_pct < 20)
    return {
      text: `${pct(hero.length / J.length, 0)} of visitors (${fmt(hero.length)}) never scroll past the hero (<20%) and convert at ${pct(rate(hero))}. The ${fmt(past.length)} who reach the proof block convert at ${pct(rate(past))} — a ${(rate(past) / rate(hero)).toFixed(1)}× lift. Compressing the hero is the #1 ranked action.`,
      rec: data.recommendations.find((r) => r.finding.signal === 'reached_proof'),
      evidence: data.evidence.slice(0, 3),
    }
  }
  // 4) worst / best keyword or campaign
  if (/(worst|waste|bad|cut|negative).*(keyword|term|search|campaign)/.test(q) || /wasted spend/.test(q)) {
    const wasted = data.keyword_intel.filter((k) => k.wasted_spend_flag)
    return {
      text: `${wasted.length} search terms are flagged as wasted spend (low qualified-rate, real volume): ` +
        wasted.map((k) => `"${k.key}" (${pct(k.qualified_rate, 0)}, ${fmt(k.leads)} leads)`).join(', ') +
        `. Adding these as negatives frees budget for the high-intent winners.`,
      rec: data.recommendations.find((r) => r.entity === 'search_term'),
    }
  }
  if (/(best|top|winning|scale).*(keyword|term|campaign|page)/.test(q)) {
    const best = [...data.keyword_intel].sort((a, b) => b.qualified_rate - a.qualified_rate).slice(0, 3)
    return {
      text: `Highest qualified-rate search terms to scale: ` +
        best.map((k) => `"${k.key}" (${pct(k.qualified_rate)}, ${fmt(k.leads)} leads)`).join(', ') + '.',
    }
  }
  // 5) top recommendation / what should I do
  if (/(what should i|recommend|priorit|do first|top action|biggest)/.test(q)) {
    const r = data.recommendations[0]
    return {
      text: `Top of the queue by ${data.meta.north_stars[0].label}: **${r.title}** — +${fmt(r.incremental_leads)} qualified leads/mo est. ${r.because}`,
      rec: r,
      evidence: r.finding ? data.evidence.slice(0, 3) : [],
    }
  }
  // 6) a specific landing page
  const page = pickPage(data, q)
  if (page && /(page|landing|convert|scroll|section)/.test(q)) {
    const s = page.top_signals[0]
    return {
      text: `${page.page}: ${fmt(page.n)} visitors at ${pct(page.cvr)} CVR. Section reach — converters vs non-converters: ` +
        Object.keys(page.sections_converters).map((k) => `${k} ${pct(page.sections_converters[k], 0)}/${pct(page.sections_nonconverters[k], 0)}`).join(', ') +
        `. Strongest differentiator: ${s ? `${s.signal} (${s.lift}× lift)` : 'n/a'}.`,
    }
  }
  // fallback: summary + suggestions
  const s = summarize(J)
  return {
    text: `I ground every answer in the signal + journey layer for ${data.meta.client}. Right now: ${fmt(s.n)} journeys, ${pct(s.cvr)} conversion rate, avg scroll ${s.avg_scroll}%, ${data.recommendations.length} ranked actions. Try asking:`,
    suggest: [
      'What separates converters from non-converters?',
      'Why do people bounce on mobile?',
      'Which search terms are wasted spend?',
      'What should I do first?',
    ],
  }
}

const SIGtest = (key) => {
  const m = {
    reached_proof: (j) => j.max_scroll_pct >= 20,
    reached_testimonials: (j) => j.reached_testimonials,
    returning: (j) => j.returning,
    no_rage: (j) => !j.rage_clicked,
    desktop: (j) => j.device === 'Desktop',
    high_intent: (j) => j.intent_score >= 75,
    reached_cta: (j) => j.max_scroll_pct >= 90,
  }
  return m[key] || (() => false)
}

// card-to-chat handoff (S9.2): the user-facing prompt shown in the transcript
export function handoffPrompt(kind, ctx) {
  if (kind === 'explain') return `Why is "${ctx.title}" the right call?`
  if (kind === 'draft') return `Refine the action for "${ctx.title}".`
  return ctx.title || ''
}

// structured handoff answer built directly from the rec context — no re-deriving.
export function recAnswer(kind, rec, data) {
  const f = rec.finding
  if (kind === 'draft') {
    return {
      text: `Here's the drafted action for **${rec.title}** (${rec.draft.type}). It targets the ${rec.entity.replace('_', ' ')} that owns the failing signal — worth +${fmt(rec.incremental_leads)} qualified leads/mo at ${rec.confidence} confidence:`,
      code: rec.draft.artifact.filter(Boolean).join('\n'),
      followup: `Apply via: ${rec.draft.apply_via} You can edit any line before it goes to the approval gate.`,
      rec,
    }
  }
  // explain
  return {
    text: `**${rec.title}** ranks #${rec.rank} because the lift is large and the fix is mechanical. ${rec.because}`,
    followup: `${f.cohort_a} convert at **${pct(f.rate_a)}** vs **${pct(f.rate_b)}** for ${f.cohort_b} — a ${f.lift}× lift on n=${fmt(f.n_a + f.n_b)}. The action — ${rec.do} — hits the **${rec.entity.replace('_', ' ')}** that owns the ${f.signal} signal. Proof is the replays below.`,
    evidence: data.evidence.slice(0, 3),
    rec,
  }
}

// ---- optional LLM upgrade (S9.1 full NL) via Claude API ----
export async function llmAnswer(question, data, apiKey, model = 'claude-sonnet-4-6') {
  const context = {
    client: data.meta.client, funnel: data.meta.funnel,
    funnel_summary: data.funnel_summary, funnel_stages: data.funnel_stages,
    metrics: data.metrics,
    recommendations: data.recommendations.map((r) => ({
      rank: r.rank, title: r.title, entity: r.entity, because: r.because, do: r.do,
      incremental_leads: r.incremental_leads, confidence: r.confidence,
    })),
    keyword_intel: data.keyword_intel, campaign_intel: data.campaign_intel,
    converter_diff: data.converter_diff.map((d) => ({ page: d.page, cvr: d.cvr, top_signals: d.top_signals })),
    assumptions: data.meta.assumptions,
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system:
        'You are the analyst agent inside a Journey Intelligence Dashboard. Answer ONLY from the ' +
        'provided substrate JSON (signals/findings/recommendations), never invent numbers. Be concise, ' +
        'cite the real figures, and end by pointing to the relevant ranked recommendation if one fits. ' +
        'Substrate:\n' + JSON.stringify(context),
      messages: [{ role: 'user', content: question }],
    }),
  })
  if (!res.ok) throw new Error('API ' + res.status + ' — ' + (await res.text()).slice(0, 200))
  const j = await res.json()
  return j.content.map((c) => c.text).join('')
}
