import { useMemo, useState } from 'react'
import { fmt, pct, shortDate, timeOf, cvrColor } from '../lib/format.js'
import { DIMENSIONS, distinctValues, matchAll, summarize, diffCohorts } from '../lib/engine.js'

export default function Journeys({ data, ctx }) {
  const [tab, setTab] = useState('explorer')
  return (
    <>
      <div className="filters" style={{ marginBottom: 16 }}>
        <button className={'btn sm' + (tab === 'explorer' ? ' primary' : '')} onClick={() => setTab('explorer')}>Journey explorer</button>
        <button className={'btn sm' + (tab === 'cohort' ? ' primary' : '')} onClick={() => setTab('cohort')}>Custom cohort builder</button>
      </div>
      {tab === 'explorer' ? <Explorer data={data} /> : <CohortBuilder data={data} />}
    </>
  )
}

/* ---------------- journey explorer (real timelines) ---------------- */
function Explorer({ data }) {
  const withTimeline = new Set(Object.keys(data.timelines))
  const list = useMemo(
    () => data.journeys.filter((j) => withTimeline.has(j.lead_id))
      .sort((a, b) => b.converted - a.converted || b.intent_score - a.intent_score),
    [data]
  )
  const [sel, setSel] = useState(list[0]?.lead_id)
  const j = list.find((x) => x.lead_id === sel) || list[0]
  const trace = data.timelines[sel] || []

  return (
    <div className="grid2" style={{ gridTemplateColumns: '360px 1fr', alignItems: 'start' }}>
      <div className="card" style={{ padding: 0, maxHeight: '72vh', overflowY: 'auto' }}>
        <table>
          <thead><tr><th>Visitor</th><th>Scroll</th><th>Outcome</th></tr></thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.lead_id} className="clickable" onClick={() => setSel(x.lead_id)}
                style={x.lead_id === sel ? { outline: '1px solid var(--accent)' } : {}}>
                <td>
                  <div style={{ color: 'var(--txt)', fontWeight: 600 }}>{x.engagement_archetype}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>{x.device} · {x.lead_id.slice(0, 8)}</div>
                </td>
                <td><span className="mini-scroll"><i style={{ width: x.max_scroll_pct + '%' }} /></span></td>
                <td>{x.converted ? <span className="chip conv">✓</span> : <span className="chip">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Journey {j.lead_id.slice(0, 12)} — click → outcome</h3>
        <div className="sub">
          Identity-resolved visitor · {j.visit_count} visit(s) · {j.pageviews} pageviews · intent {j.intent_score} · friction {j.friction_score}
        </div>
        <div className="stat-inline">
          <div className="si"><div className="v" style={{ color: cvrColor(j.max_scroll_pct / 100 * 0.12, 0.12) }}>{j.max_scroll_pct}%</div><div className="l">max scroll</div></div>
          <div className="si"><div className="v">{j.device}</div><div className="l">device</div></div>
          <div className="si"><div className="v" style={{ fontSize: 13, marginTop: 5 }}>{j.search_term || '—'}</div><div className="l">search term</div></div>
          <div className="si"><div className="v" style={{ color: j.converted ? 'var(--good)' : 'var(--txt-2)' }}>{j.converted ? 'Qualified' : 'Lost'}</div><div className="l">outcome</div></div>
        </div>
        <div style={{ margin: '4px 0 10px', fontSize: 11.5, color: 'var(--txt-3)' }}>
          Signals: {j.sections_seen.join(' · ')} {j.rage_clicked && '· ⚠ rage-click'} {j.returning && '· returning'}
        </div>
        <div className="timeline">
          {trace.map((e, i) => {
            const kind = e.ev === 'rageclick' ? 'rage' : e.path === '/thank-you/' ? 'convert' : ''
            return (
              <div className={'tl-ev ' + kind} key={i}>
                <div className="te">
                  {e.ev === 'pageview' && <>Viewed <span className="lp">{e.path}</span></>}
                  {e.ev === 'pageleave' && <>Left <span className="lp">{e.path}</span> — scrolled {e.scroll}%</>}
                  {e.ev === 'rageclick' && <span style={{ color: 'var(--bad)' }}>Rage-clicked on {e.path}</span>}
                </div>
                <div className="tm">{shortDate(e.ts)} {timeOf(e.ts)} · session {String(e.sid).slice(0, 8)}</div>
              </div>
            )
          })}
          {trace.length === 0 && <div className="empty">No event trace captured.</div>}
        </div>
        {j.first_session && (
          <a className="btn sm" style={{ marginTop: 12, display: 'inline-block' }}
            href={`https://us.posthog.com/project/${data.meta.project_id}/replay?sessionRecordingId=${j.first_session}`}
            target="_blank" rel="noreferrer">▶ Open session replay</a>
        )}
      </div>
    </div>
  )
}

/* ---------------- custom cohort builder ---------------- */
const OPS_FOR = { enum: ['=', '≠'], bool: ['is true', 'is false'], num: ['≥', '≤', '='] }
function CohortBuilder({ data }) {
  const J = data.journeys
  const [preds, setPreds] = useState([{ field: 'device', op: '=', value: 'Mobile' }])
  const cohortA = useMemo(() => J.filter((j) => matchAll(j, preds)), [J, preds])
  const cohortB = useMemo(() => J.filter((j) => !matchAll(j, preds)), [J, preds])
  const sA = summarize(cohortA), sB = summarize(cohortB)
  const diff = useMemo(() => diffCohorts(cohortA, cohortB).filter((d) => d.lift > 0).slice(0, 7), [cohortA, cohortB])

  const setPred = (i, patch) => setPreds((p) => p.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const dimKind = (f) => DIMENSIONS.find((d) => d.key === f)?.kind || 'enum'

  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <div className="card">
        <h3>Define cohort A</h3>
        <div className="sub">Split journeys by any signal/dimension — runs the same lift engine as the pipeline.</div>
        {preds.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <select value={p.field} onChange={(e) => setPred(i, { field: e.target.value, op: OPS_FOR[dimKind(e.target.value)][0], value: '' })}
              style={selStyle}>
              {DIMENSIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <select value={p.op} onChange={(e) => setPred(i, { op: e.target.value })} style={selStyle}>
              {OPS_FOR[dimKind(p.field)].map((o) => <option key={o}>{o}</option>)}
            </select>
            {dimKind(p.field) === 'enum' ? (
              <select value={p.value} onChange={(e) => setPred(i, { value: e.target.value })} style={{ ...selStyle, flex: 1 }}>
                <option value="">—</option>
                {distinctValues(J, p.field).map((v) => <option key={v} value={v}>{String(v)}</option>)}
              </select>
            ) : dimKind(p.field) === 'num' ? (
              <input value={p.value} onChange={(e) => setPred(i, { value: e.target.value })} placeholder="value" style={{ ...selStyle, flex: 1 }} />
            ) : <div style={{ flex: 1 }} />}
            {preds.length > 1 && <button className="btn sm ghost" onClick={() => setPreds((pp) => pp.filter((_, k) => k !== i))}>✕</button>}
          </div>
        ))}
        <button className="btn sm" onClick={() => setPreds((p) => [...p, { field: 'reached_testimonials', op: 'is true', value: '' }])}>+ AND condition</button>

        <div className="stat-inline" style={{ marginTop: 18 }}>
          <div className="si"><div className="v">{fmt(sA.n)}</div><div className="l">Cohort A</div></div>
          <div className="si"><div className="v" style={{ color: 'var(--good)' }}>{pct(sA.cvr)}</div><div className="l">A CVR</div></div>
          <div className="si"><div className="v">{fmt(sB.n)}</div><div className="l">Cohort B (rest)</div></div>
          <div className="si"><div className="v" style={{ color: 'var(--bad)' }}>{pct(sB.cvr)}</div><div className="l">B CVR</div></div>
          <div className="si"><div className="v" style={{ color: 'var(--accent)' }}>{sB.cvr ? (sA.cvr / sB.cvr).toFixed(2) : '∞'}×</div><div className="l">CVR lift</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Signal lift — A vs B</h3>
        <div className="sub">How much more common each signal is in cohort A. Ranked by lift.</div>
        {diff.map((s) => (
          <div className="hbar" key={s.key}>
            <div className="k">{s.signal}</div>
            <div className="hbar-track"><div className="hbar-fill" style={{ width: pct(Math.min(1, s.a_share), 0) }} /></div>
            <div className="val"><b>{s.lift ? s.lift.toFixed(2) : '—'}×</b> · {pct(s.a_share, 0)}/{pct(s.b_share, 0)}</div>
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 12 }}>
          Saveable as a finding — the same output the recommendation engine consumes (Epic 2 → Epic 3).
        </div>
      </div>
    </div>
  )
}
const selStyle = { fontFamily: 'var(--sans)', fontSize: 12, padding: '7px 9px', background: 'var(--panel)', border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--txt)' }
