import { useEffect, useState } from 'react'
import CommandCenter from '../screens/CommandCenter.jsx'
import ConverterDiff from '../screens/ConverterDiff.jsx'
import Journeys from '../screens/Journeys.jsx'
import CreativeCampaign from '../screens/CreativeCampaign.jsx'
import Evidence from '../screens/Evidence.jsx'
import Signals from '../screens/Signals.jsx'
import AgentChat from '../components/AgentChat.jsx'

const NAV = [
  { id: 'command', label: 'Command center', ic: '◎' },
  { id: 'diff', label: 'Converter diff', ic: '⇄' },
  { id: 'journeys', label: 'Journeys & cohorts', ic: '⋯' },
  { id: 'campaign', label: 'Creative & campaign', ic: '◈' },
  { id: 'evidence', label: 'Evidence & replays', ic: '▶' },
  { id: 'signals', label: 'Signal taxonomy', ic: '≡' },
]
const SCREENS = { command: CommandCenter, diff: ConverterDiff, journeys: Journeys, campaign: CreativeCampaign, evidence: Evidence, signals: Signals }

export default function SessionsView() {
  const [data, setData] = useState(null)
  const [screen, setScreen] = useState('command')
  const [role] = useState('agency-admin')
  const [northStar, setNorthStar] = useState('cvr')
  const [value, setValue] = useState(1200)
  const [status, setStatus] = useState({})
  const [chatOpen, setChatOpen] = useState(true)
  const [handoff, setHandoff] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [rangeDays, setRangeDays] = useState(45)

  const loadData = () =>
    fetch('substrate.json?t=' + Date.now()).then((r) => r.json()).then((d) => {
      setData(d); setValue(d.meta.value_per_lead); setNorthStar(d.meta.north_star_default)
      setRangeDays(d.meta.window_days || 45)
    })

  useEffect(() => { loadData().catch((e) => console.error('load failed', e)) }, [])

  const refresh = async (days) => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const res = await fetch('/api/refresh' + (days ? '?days=' + days : ''), { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.ok === false) throw new Error(body.error || ('HTTP ' + res.status))
      await loadData()
    } catch (e) {
      console.error('refresh failed', e)
      alert('Refresh failed: ' + e.message)
    } finally {
      setRefreshing(false)
    }
  }
  const changeRange = (days) => { setRangeDays(days); refresh(days) }

  if (!data) return <div className="loading"><div className="spin" /> Materializing substrate from PostHog…</div>

  const Screen = SCREENS[screen]
  const openCount = data.recommendations.filter((r) => (status[r.id] || 'open') === 'open').length
  const toAgent = (kind, rec) => { setChatOpen(true); setHandoff({ kind, ctx: rec, t: Date.now() }) }
  const ctx = { northStar, value, setValue, status, setStatus, role, toAgent }

  return (
    <div className="sess-view">
      <div className="main" style={chatOpen ? { marginRight: 'var(--chat)' } : {}}>
        <div className="topbar">
          <div className="crumb">
            <h1>Sessions</h1>
            <p>Real-time PostHog web-session intelligence · Progen Weight Management</p>
          </div>
          <div className="controls">
            <div className="ctl live"><span className="dot" /> live · PostHog</div>
            {import.meta.env.DEV && (
              <button className={'ctl refresh' + (refreshing ? ' busy' : '')} onClick={() => refresh()} disabled={refreshing}
                title={data.meta.generated_at ? 'Last refreshed ' + new Date(data.meta.generated_at).toLocaleString() : 'Re-pull from PostHog'}>
                <span className="ic">⟳</span>{refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
            <div className="ctl">
              <label>North-star</label>
              <select value={northStar} onChange={(e) => setNorthStar(e.target.value)}>
                {data.meta.north_stars.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
              </select>
            </div>
            {import.meta.env.DEV ? (
              <div className="ctl" title={`${data.meta.date_range[0]} → ${data.meta.date_range[1]} · re-pulls PostHog`}>
                <label>Range</label>
                <select value={rangeDays} onChange={(e) => changeRange(Number(e.target.value))} disabled={refreshing}>
                  {[7, 14, 30, 45, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
                </select>
              </div>
            ) : (
              <div className="ctl"><label>Range</label><span>{data.meta.date_range[0]?.slice(5)} – {data.meta.date_range[1]?.slice(5)}</span></div>
            )}
          </div>
        </div>

        {/* secondary tab strip (dashboard screens) */}
        <div className="sess-tabs">
          {NAV.map((n) => (
            <button key={n.id} className={'sess-tab' + (screen === n.id ? ' on' : '')} onClick={() => setScreen(n.id)}>
              <span className="ic">{n.ic}</span>{n.label}
              {n.id === 'command' && openCount > 0 && <span className="badge">{openCount}</span>}
            </button>
          ))}
          <div className="spacer" />
          <button className={'sess-tab agent' + (chatOpen ? ' on' : '')} onClick={() => setChatOpen((o) => !o)}>✦ Analyst agent {chatOpen ? '›' : '‹'}</button>
        </div>

        <div className="main-inner">
          <Screen data={data} ctx={ctx} />
        </div>
      </div>

      {chatOpen && (
        <AgentChat data={data} handoff={handoff} clearHandoff={() => setHandoff(null)} onOpenRec={() => setScreen('command')} />
      )}
    </div>
  )
}
