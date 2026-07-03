// The proposed **Session Data** block for an identity — PostHog web sessions
// joined to the contact by email. MOCK data (see lib/mockIdentities.js); in
// production this reads from the same substrate the Sessions tab builds.

const KIND_ICON = { pageview: '◉', scroll: '↓', form: '✓', rage: '⚡', cta: '★' }

export default function SessionPanel({ c }) {
  const s = c.session

  if (!s.matched) {
    return (
      <div className="ds-card ds-sess empty">
        <div className="ds-card-h">
          <span className="lbl">SESSION DATA</span>
          <span className="tag grey">PostHog · web sessions</span>
        </div>
        <div className="ds-sess-empty">
          <b>No web session matched.</b>
          <span className="muted">No PostHog identity resolved for <code>{c.email}</code>. Sessions link to a contact once the visitor is identified (form submit / <code>identify</code>). Aggregate traffic still appears in the <b>Sessions</b> tab.</span>
        </div>
      </div>
    )
  }

  const m = s.summary
  const chips = [
    ['Sessions', m.count], ['Total time', m.total_time], ['Max scroll', m.max_scroll_pct + '%'],
    ['Device', m.device], ['Rage clicks', m.rage_clicks], ['Intent', m.intent_score + '/100'],
  ]
  return (
    <div className="ds-card ds-sess">
      <div className="ds-card-h">
        <span className="lbl">SESSION DATA · {m.count} SESSIONS</span>
        <span className="tag blue">matched by email · from Sessions tab</span>
      </div>

      {/* summary chips */}
      <div className="ds-sess-sum">
        {chips.map(([k, v]) => (
          <div key={k} className="sc"><div className="k">{k.toUpperCase()}</div><div className="v">{v}</div></div>
        ))}
      </div>

      {/* scroll depth / sections reached */}
      <div className="ds-sess-scroll">
        <div className="lbl2">SECTIONS REACHED (deepest session)</div>
        <div className="ds-scrollbar">
          {['hero', 'proof', 'testimonials', 'pricing_faq', 'cta'].map((sec) => (
            <div key={sec} className={'seg' + (m.sections_seen.includes(sec) ? ' on' : '')}>{sec.replace('_', '/')}</div>
          ))}
        </div>
      </div>

      <div className="ds-grid2">
        {/* session rows */}
        <div>
          <div className="lbl2">SESSIONS</div>
          <div className="ds-sess-rows">
            {s.sessions.map((x) => (
              <div key={x.id} className="ds-sess-row">
                <div className="col grow">
                  <div className="t1">{x.landing}</div>
                  <div className="t2">{x.date} · {x.device} · {x.source}{x.rage_clicked ? ' · ⚡ rage' : ''}</div>
                </div>
                <div className="col r">
                  <div className="t1">{x.max_scroll_pct}% · {fmt(x.duration_s)}</div>
                  <a className="replay" href={x.replay_url} target="_blank" rel="noreferrer">▶ replay</a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* session buyer journey */}
        <div>
          <div className="lbl2">SESSION BUYER JOURNEY</div>
          <div className="ds-timeline">
            {s.timeline.map((e, i) => (
              <div key={i} className={'tl ' + e.kind}>
                <span className="tl-ic">{KIND_ICON[e.kind] || '•'}</span>
                <span className="tl-t">{e.t}</span>
                <span className="tl-l">{e.label}</span>
                <span className="tl-s">{e.section}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ds-sess-foot muted sm">
        Joined on <code>email</code> ({c.email}) → PostHog <code>$user_id</code>. Full account-level view in the <b>Sessions</b> tab.
      </div>
    </div>
  )
}

const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)
