import { useState } from 'react'
import Identities from './product/Identities.jsx'
import SessionsView from './product/SessionsView.jsx'

// Data Spine children — Sessions inserted right after Identities (per the ask).
const SPINE = [
  { id: 'identities', label: 'Identities', ic: '⛶' },
  { id: 'sessions', label: 'Sessions', ic: '❖', badge: 'live' },
  { id: 'agents', label: 'Marketing Agents', ic: '☰' },
  { id: 'events', label: 'Event Types', ic: '⚑' },
  { id: 'ingest', label: 'Ingest Events', ic: '⇪' },
]
const TOP = [
  { id: 'home', label: 'Home', ic: '⌂' },
  { id: 'workspaces', label: 'Workspaces', ic: '▦' },
  { id: 'mission', label: 'Mission Control', ic: '◍' },
]

export default function App() {
  const [section, setSection] = useState('identities')

  return (
    <div className="ds-shell">
      <aside className="ds-nav">
        <div className="ds-logo">
          <div className="mk">M</div>
          <div className="nm">Meerkats.ai<small>AI Growth Intelligence</small></div>
        </div>

        <div className="ds-wsel">
          <div className="k">WORKSPACE</div>
          <div className="row"><div className="wav">P</div><b>Progen_method</b><span className="cr">⌄</span></div>
        </div>

        {TOP.map((n) => (
          <div key={n.id} className={'ds-nav-item' + (section === n.id ? ' on' : '')} onClick={() => setSection(n.id)}>
            <span className="ic">{n.ic}</span>{n.label}
          </div>
        ))}

        <div className="ds-nav-sec">Recent chats<span className="plus">+</span></div>
        <div className="ds-nav-item sub"><span className="ic">▭</span><span className="ell">list my google ads account a…</span><span className="ago">1d</span></div>

        <div className="ds-nav-item" onClick={() => setSection('templates')}><span className="ic">✧</span>Templates</div>

        <div className="ds-nav-group on">
          <span className="ic">◈</span>Data Spine<span className="cr">⌄</span>
        </div>
        {SPINE.map((n) => (
          <div key={n.id} className={'ds-nav-item child' + (section === n.id ? ' on' : '')} onClick={() => setSection(n.id)}>
            <span className="ic">{n.ic}</span>{n.label}
            {n.badge && <span className="livebadge">live</span>}
          </div>
        ))}

        <div className="ds-nav-item" onClick={() => setSection('integrations')}><span className="ic">⚯</span>Integrations</div>
        <div className="ds-nav-item" onClick={() => setSection('settings')}><span className="ic">⚙</span>Settings</div>

        <div className="ds-spacer" />
        <div className="ds-user">
          <div className="uav">V</div>
          <div className="uinfo"><b>vinay</b><small>vinay@meerkats.ai</small></div>
          <span className="cr">⌄</span>
        </div>
      </aside>

      <main className="ds-main">
        {section === 'identities' && <Identities />}
        {section === 'sessions' && <SessionsView />}
        {!['identities', 'sessions'].includes(section) && <Placeholder id={section} onGo={setSection} />}
      </main>
    </div>
  )
}

function Placeholder({ id, onGo }) {
  const name = { home: 'Home', workspaces: 'Workspaces', mission: 'Mission Control', templates: 'Templates', agents: 'Marketing Agents', events: 'Event Types', ingest: 'Ingest Events', integrations: 'Integrations', settings: 'Settings' }[id] || id
  return (
    <div className="ds-placeholder">
      <h2>{name}</h2>
      <p>This screen lives in the Meerkats product. This demo focuses on <b>Data Spine → Identities</b> (mock, with the proposed per-contact Session Data) and <b>Sessions</b> (live PostHog intelligence).</p>
      <div className="row">
        <button className="ds-btn primary" onClick={() => onGo('identities')}>Go to Identities</button>
        <button className="ds-btn" onClick={() => onGo('sessions')}>Go to Sessions</button>
      </div>
    </div>
  )
}
