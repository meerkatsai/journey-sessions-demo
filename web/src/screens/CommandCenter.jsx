import { useState } from 'react'
import { fmt, inr, pct, signed } from '../lib/format.js'
import Sparkline from '../components/Sparkline.jsx'

export default function CommandCenter({ data, ctx }) {
  const { northStar, value, setValue, status, setStatus, role, toAgent } = ctx
  const [stageFilter, setStageFilter] = useState(null)

  const rankVal = (r) => (northStar === 'leads' ? r.incremental_leads * value : r.incremental_leads)
  let recs = [...data.recommendations].sort((a, b) => rankVal(b) - rankVal(a))
  if (stageFilter) recs = recs.filter((r) => r.stage === stageFilter)
  const open = data.recommendations.filter((r) => (status[r.id] || 'open') === 'open')
  const stakeLeads = open.reduce((s, r) => s + r.incremental_leads, 0)

  return (
    <>
      <MetricHeader data={data} value={value} stakeLeads={stakeLeads} />
      <FunnelCard data={data} stageFilter={stageFilter} setStageFilter={setStageFilter} />

      <div className="sec-head">
        <h2>Decision queue</h2>
        <div className="hint">
          {open.length} open · ranked by {data.meta.north_stars.find((n) => n.key === northStar)?.label} — the max useful
          set, not a dump.
        </div>
      </div>
      {stageFilter && (
        <div className="filter-note">
          Filtered to <b style={{ margin: '0 4px' }}>{stageFilter}</b> recommendations
          <button onClick={() => setStageFilter(null)}>✕</button>
        </div>
      )}
      <div className="queue">
        {recs.map((r) => (
          <RecCard
            key={r.id}
            rec={r}
            evidence={data.evidence}
            northStar={northStar}
            value={value}
            role={role}
            state={status[r.id] || 'open'}
            setStatus={setStatus}
            toAgent={toAgent}
          />
        ))}
        {recs.length === 0 && <div className="empty">No recommendations for this stage.</div>}
      </div>

      <div className="assumptions">
        <h4>Assumptions &amp; honesty notes</h4>
        <div className="value-input" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--txt-2)' }}>Value per conversion: ₹</span>
          <input type="number" value={value} onChange={(e) => setValue(Number(e.target.value) || 0)} />
          <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>— rescales the ₹ north-star live</span>
        </div>
        <ul>{data.meta.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
      </div>
    </>
  )
}

function MetricHeader({ data, value, stakeLeads }) {
  const ts = data.timeseries
  const seriesFor = (k) => ts.map((d) => (k === 'cvr' ? d.cvr : d[k]))
  const fmtV = (m) => (m.fmt === 'pct' ? pct(m.value) : fmt(m.value))
  return (
    <div className="metric-row">
      {data.metrics.map((m, i) => (
        <div key={m.key} className={'metric' + (i === 0 ? ' star' : '')}>
          {m.anomaly && <span className="anom">⚠ anomaly</span>}
          <div className="ml">{m.label}</div>
          <div className="mv tnum">{fmtV(m)}</div>
          <div className={'md ' + (m.delta >= 0 === m.good_up ? 'up' : 'down')}>
            {signed(m.delta)} vs prior 14d
          </div>
          <Sparkline
            points={seriesFor(m.key === 'engaged_rate' ? 'engaged' : m.key)}
            color={m.anomaly ? 'var(--warn)' : i === 0 ? 'var(--accent)' : 'var(--txt-2)'}
          />
        </div>
      ))}
    </div>
  )
}

function FunnelCard({ data, stageFilter, setStageFilter }) {
  const stages = data.funnel_stages
  const max = stages[0].n
  const leak = stages.find((s) => s.biggest_leak)
  const stageMap = { 'Ad click → landing': null, 'Engaged (past hero ≥20%)': 'Landing page', 'Read proof (≥45%)': 'Landing page', 'Qualified (booked)': null }
  return (
    <div className="card">
      <h3>Click → conversion funnel</h3>
      <div className="sub">
        Biggest leak flagged. {leak && <>Largest drop-off is <b style={{ color: 'var(--bad)' }}>{leak.name}</b> ({pct(leak.drop, 0)} lost) — click a stage to filter the queue.</>}
      </div>
      <div className="funnel">
        {stages.map((s, i) => {
          const target = stageMap[s.name]
          return (
            <div
              key={s.name}
              className={'fstage' + (s.biggest_leak ? ' leak' : '') + (stageFilter && stageFilter === target ? ' active' : '')}
              onClick={() => target && setStageFilter(stageFilter === target ? null : target)}
            >
              <div className="fbar" style={{ height: 44 + (s.n / max) * 60 }}>
                {s.biggest_leak && <span className="leak-flag">LEAK</span>}
                <div className="fn tnum">{fmt(s.n)}</div>
                <div className="fl">{s.name}</div>
              </div>
              <div className="fdrop">{i === 0 ? `${pct(s.of_top, 0)} of top` : <><b>−{pct(s.drop, 0)}</b> · {pct(s.of_top, 1)} of top</>}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RecCard({ rec, evidence, northStar, value, role, state, setStatus, toAgent }) {
  const [open, setOpen] = useState(rec.rank === 1)
  const [applied, setApplied] = useState(false)
  const f = rec.finding
  const canApply = role === 'agency-admin' || role === 'marketer'
  const impact = northStar === 'leads' ? inr(rec.incremental_leads * value) : '+' + fmt(rec.incremental_leads)
  const impactLbl = northStar === 'leads' ? 'est. / mo' : 'conversions/mo'
  const maxR = Math.max(f.rate_a, f.rate_b)
  const set = (st) => setStatus((s) => ({ ...s, [rec.id]: s[rec.id] === st ? undefined : st }))

  return (
    <div className={'rec ' + state + (open ? ' open' : '')}>
      <div className="rec-head" onClick={() => setOpen((o) => !o)}>
        <div className="rank">{rec.rank}</div>
        <div>
          <div className="rt">{rec.title}</div>
          <div className="rmeta">
            <span className="tag stage">{rec.stage}</span>
            <span className="tag entity">owns: {rec.entity.replace('_', ' ')}</span>
            <span className={'conf ' + rec.confidence}>{rec.confidence} confidence</span>
            <span className="tag">n = {fmt(f.n_a + f.n_b)}</span>
            {state !== 'open' && <span className="tag">{state}</span>}
          </div>
        </div>
        <div className="rimpact">
          <div className="amt tnum">{impact}</div>
          <div className="lbl">{impactLbl} ▸</div>
        </div>
      </div>

      {open && (
        <div className="rec-body">
          <div className="bdi">
            <h4>Because — the lift finding</h4>
            <p>{rec.because}</p>
            <div style={{ marginTop: 12 }}>
              <div className="cohort-row">
                <div className="cl"><b>{f.cohort_a}</b> · {fmt(f.n_a)}</div>
                <div className="bar-track"><div className="bar-fill a" style={{ width: pct(f.rate_a / maxR, 0) }} /></div>
                <div className="cv" style={{ color: 'var(--good)' }}>{pct(f.rate_a)}</div>
              </div>
              <div className="cohort-row">
                <div className="cl"><b>{f.cohort_b}</b> · {fmt(f.n_b)}</div>
                <div className="bar-track"><div className="bar-fill b" style={{ width: pct(f.rate_b / maxR, 0) }} /></div>
                <div className="cv" style={{ color: 'var(--bad)' }}>{pct(f.rate_b)}</div>
              </div>
              <div style={{ marginTop: 10 }}>
                <span className="lift-chip">{f.lift}× lift</span>{' '}
                <span style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>
                  {fmt(f.affected_volume)} on the losing side → {fmt(rec.incremental_leads)} incremental conversions
                </span>
              </div>
            </div>
          </div>

          <div className="bdi">
            <h4>Do — draft action ({rec.draft.type})</h4>
            <div className="draft">
              <pre>{rec.draft.artifact.filter(Boolean).join('\n')}</pre>
              <div className="via">Apply via: {rec.draft.apply_via}</div>
            </div>
            <div className="actions">
              <button className="btn primary" disabled={!canApply || applied} onClick={() => setApplied(true)}>
                {applied ? '✓ Applied — logged to action_log' : canApply ? 'Apply (human-in-the-loop)' : 'Apply — needs marketer role'}
              </button>
              <button className="btn violet sm" onClick={() => toAgent('draft', rec)}>Refine with agent</button>
            </div>
            {applied && (
              <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 8 }}>
                Impact-realized tracking armed · measuring post-action CVR vs the +{fmt(rec.incremental_leads)}-conversion estimate
                after a 14-day settling window → feeds confidence recalibration.
              </div>
            )}
          </div>

          <div className="bdi full">
            <h4>Evidence chain — one click to the raw sessions</h4>
            <div className="evidence">
              {evidence.slice(0, 4).map((e) => (
                <a key={e.id} className="ev-link" href={e.url} target="_blank" rel="noreferrer">
                  <span className="play">▶ replay</span>
                  <span className="u">{e.start_url}</span>
                  <span className="d">{e.duration_s}s · {e.clicks ?? 0} clicks</span>
                </a>
              ))}
            </div>
            <div className="actions">
              <button className="btn sm" onClick={() => set('shipped')}>{state === 'shipped' ? '✓ Shipped' : 'Mark shipped'}</button>
              <button className="btn sm ghost" onClick={() => set('dismissed')}>{state === 'dismissed' ? 'Restore' : 'Dismiss'}</button>
              <button className="btn sm" onClick={() => toAgent('explain', rec)}>Ask why</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
