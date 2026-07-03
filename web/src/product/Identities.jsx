import { useMemo, useState } from 'react'
import { IDENTITIES, STAGE_LIST, CONTACTS_META } from '../lib/mockIdentities.js'
import SessionPanel from './SessionPanel.jsx'

const PILLS = ['All', ...STAGE_LIST.filter((s) => s !== 'Engagement')]

export default function Identities() {
  const [selId, setSelId] = useState(IDENTITIES[0].id)
  const [q, setQ] = useState('')
  const [pill, setPill] = useState('All')

  const counts = useMemo(() => {
    const c = { All: IDENTITIES.length }
    STAGE_LIST.forEach((s) => { c[s] = IDENTITIES.filter((x) => x.funnel_stage === s).length })
    return c
  }, [])

  const filtered = useMemo(() => IDENTITIES.filter((x) => {
    const okPill = pill === 'All' || x.funnel_stage === pill
    const okQ = !q || (x.name + x.id + x.email + x.lead_source).toLowerCase().includes(q.toLowerCase())
    return okPill && okQ
  }), [q, pill])

  const sel = IDENTITIES.find((x) => x.id === selId) || filtered[0]

  return (
    <div className="ds-page">
      {/* page topbar */}
      <div className="ds-top">
        <div className="ds-crumb">
          <span className="muted">meerkats</span> / <b>{CONTACTS_META.workspace}</b>
          <span className="ds-chip">{CONTACTS_META.total_contacts} contacts · {CONTACTS_META.total_events} events</span>
        </div>
        <input className="ds-search" placeholder="Search name, ID, center…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ds-pills">
          {PILLS.map((p) => (
            <button key={p} className={'ds-pill' + (pill === p ? ' on' : '')} onClick={() => setPill(p)}>
              {p} ({counts[p] ?? 0})
            </button>
          ))}
        </div>
      </div>

      <div className="ds-substat">
        <span className="tag grey">{filtered.length} shown</span>
        <span className="tag green">{CONTACTS_META.activated} activated</span>
        <span className="tag red">{CONTACTS_META.high_risk} high risk</span>
        <span className="tag grey">{CONTACTS_META.total_events} events</span>
      </div>

      <div className="ds-body">
        {/* contact list */}
        <div className="ds-list">
          <div className="ds-list-head">{(pill === 'All' ? 'Acquisition' : pill).toUpperCase()}<span>{filtered.length}</span></div>
          {filtered.map((c) => (
            <div key={c.id} className={'ds-contact' + (c.id === selId ? ' on' : '')} onClick={() => setSelId(c.id)}>
              <div className="av">{c.initials}</div>
              <div className="who">
                <div className="nm">{c.name}</div>
                <div className="sub">{c.id} · Unknown</div>
              </div>
              <div className={'dot' + (c.session.matched ? ' live' : '')} />
            </div>
          ))}
        </div>

        {/* identity detail */}
        {sel && <Detail c={sel} />}
      </div>

      {/* bottom action bar (mock) */}
      <div className="ds-actionbar">
        <div className="left">
          <button className="ds-btn">↓ Export JSON</button>
          <button className="ds-btn">↑ Import CSV</button>
          <button className="ds-btn">⚡ Agents</button>
        </div>
        <div className="right">
          <button className="ds-btn">Refresh</button>
          <button className="ds-btn primary">+ Add Contact</button>
        </div>
      </div>
    </div>
  )
}

function Detail({ c }) {
  const fields = [
    ['Lead source', c.lead_source], ['Campaign', c.campaign], ['Center', c.center],
    ['Advisor', c.advisor], ['Program', c.program], ['Age', c.age],
  ]
  return (
    <div className="ds-detail">
      {/* identity card */}
      <div className="ds-card">
        <div className="ds-card-h"><span className="lbl">IDENTITY <b>{c.id.toUpperCase()}</b></span><button className="ds-btn sm">Edit</button></div>
        <div className="ds-idhead">
          <div className="av lg">{c.initials}</div>
          <div>
            <div className="nm">{c.name}</div>
            <div className="sub">{c.email} · {c.phone} <span className="muted">· {c.id}</span></div>
            <span className="tag grey mt">Not activated</span>
          </div>
        </div>
        <div className="ds-fields">
          {fields.map(([k, v]) => (
            <div key={k} className="ds-field"><div className="k">{k.toUpperCase()}</div><div className="v">{v}</div></div>
          ))}
        </div>
      </div>

      {/* funnel stage */}
      <div className="ds-card">
        <div className="ds-card-h"><span className="lbl">FUNNEL STAGE</span></div>
        <div className="ds-funnel">
          {STAGE_LIST.map((s, i) => (
            <div key={s} className={'ds-stage' + (i === c.stage_idx ? ' on' : '') + (i < c.stage_idx ? ' done' : '')}>{s}</div>
          ))}
        </div>
      </div>

      {/* events + memory row */}
      <div className="ds-grid2">
        <div className="ds-card">
          <div className="ds-card-h"><span className="lbl">EVENTS · {c.events.length}</span></div>
          {c.events.map((e, i) => (
            <div key={i} className="ds-event">
              <span className="ico">📄</span>
              <div className="grow">
                <div className="et">{e.type} <span className="muted">▾</span></div>
                <div className="sub">{e.actor} · {e.fields} fields</div>
              </div>
              <span className="muted sm">{e.date}</span>
            </div>
          ))}
          <button className="ds-btn sm mt">+ Add event</button>
        </div>

        <div className="ds-side">
          <div className="ds-card">
            <div className="ds-card-h"><span className="lbl">MEMORY</span></div>
            <div className="ds-mem">
              <div className="m"><div className="mk">WEEKS</div><div className="mv">{c.memory.weeks}</div></div>
              <div className="m"><div className="mk">WEIGHT LOST</div><div className="mv">{c.memory.weight_lost} kg</div></div>
              <div className="m"><div className="mk">TARGET</div><div className="mv">{c.memory.target} kg</div></div>
            </div>
            <div className="ds-risk">
              <div className="rl">RISK SCORE</div>
              <div className="rr"><span>Score</span><b>{c.risk_score} / 100</b></div>
              <div className="rbar"><span style={{ width: c.risk_score + '%' }} /></div>
            </div>
          </div>
          <div className="ds-card">
            <div className="ds-card-h"><span className="lbl">AGENT MEMORY · {c.agent_notes.length}</span></div>
            <div className="muted sm">No notes yet.</div>
            <button className="ds-btn sm mt">+ Add note</button>
          </div>
        </div>
      </div>

      {/* NEW: session data panel (the ask) */}
      <SessionPanel c={c} />

      {/* user journey */}
      <div className="ds-card">
        <div className="ds-card-h"><span className="lbl">USER JOURNEY · {c.user_journey_count} EVENTS</span><button className="ds-btn sm">Refresh</button></div>
        {c.user_journey_count === 0
          ? <div className="muted sm">No resolved web journey for this identity.</div>
          : <div className="muted sm">Ingested product events + resolved web journey (see Session Data above for the web-session detail).</div>}
      </div>
    </div>
  )
}
