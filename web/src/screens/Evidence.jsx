import { useState } from 'react'
import { fmt, pct, shortDate } from '../lib/format.js'

// Epic 6 — evidence / replay viewer: replays filtered by a finding, section markers.
export default function Evidence({ data, ctx }) {
  const filters = [
    { key: 'all', label: 'All landing-page replays', test: () => true },
    { key: 'bounce', label: 'Bounced before proof (<30s)', test: (e) => e.duration_s < 30 },
    { key: 'engaged', label: 'Engaged sessions (>90s)', test: (e) => e.duration_s > 90 },
    { key: 'clicky', label: 'High interaction (3+ clicks)', test: (e) => (e.clicks || 0) >= 3 },
  ]
  const [f, setF] = useState('all')
  const active = filters.find((x) => x.key === f)
  const list = data.evidence.filter(active.test)

  return (
    <>
      <p className="pageintro">
        Every finding links here. Filtered session replays resolve from the finding's evidence set — the proof behind each
        recommendation is one click away. Section markers show where each session stopped scrolling.
      </p>
      <div className="filters">
        {filters.map((x) => (
          <button key={x.key} className={'btn sm' + (f === x.key ? ' primary' : '')} onClick={() => setF(x.key)}>
            {x.label}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--txt-3)', marginLeft: 'auto' }}>{list.length} replays</span>
      </div>

      <div className="grid2">
        {list.map((e) => {
          // section marker inferred from where a short/long session likely stopped
          const reached = e.duration_s < 20 ? 'hero' : e.duration_s < 60 ? 'proof' : 'testimonials+'
          const w = e.duration_s < 20 ? 12 : e.duration_s < 60 ? 32 : 60
          return (
            <a key={e.id} className="card" href={e.url} target="_blank" rel="noreferrer"
              style={{ padding: 14, textDecoration: 'none', display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="lp" style={{ fontSize: 11.5 }}>{e.path}</span>
                <span className="chip">{e.duration_s}s</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', margin: '7px 0' }}>
                {e.campaign ? `campaign ${e.campaign} · ` : ''}{e.clicks ?? 0} clicks · {e.active_s ?? 0}s active · {shortDate(e.start_time)}
              </div>
              <div style={{ position: 'relative', height: 18, background: 'var(--bg-2)', borderRadius: 5, border: '1px solid var(--line)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct(w / 100, 0), background: 'linear-gradient(90deg, var(--warn), var(--good))' }} />
                {data.section_map.map((s) => (
                  <span key={s.name} style={{ position: 'absolute', left: s.offset + '%', top: 0, bottom: 0, width: 1, background: 'var(--line-2)' }} />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10.5, color: 'var(--txt-3)' }}>stopped ≈ <b style={{ color: 'var(--txt-2)' }}>{reached}</b></span>
                <span className="play" style={{ fontSize: 11, color: 'var(--accent)' }}>▶ open replay</span>
              </div>
            </a>
          )
        })}
      </div>
      {list.length === 0 && <div className="empty">No replays match this filter.</div>}
    </>
  )
}
