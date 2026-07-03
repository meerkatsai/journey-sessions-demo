import { fmt, pct, cvrColor } from '../lib/format.js'

export default function CreativeCampaign({ data, ctx }) {
  return (
    <>
      <p className="pageintro">
        Compare targeting by <b>downstream journey outcome</b> — conversion rate, not clicks. Wasted-spend clusters and
        scale opportunities are flagged and tie back to targeting recommendations.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Campaign intelligence</h3>
        <div className="sub">Google Ads campaigns by downstream conversion rate.</div>
        <IntelTable rows={data.campaign_intel} label="Campaign" />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Keyword / search-term intelligence</h3>
        <div className="sub">Every query that drove paid traffic, by qualified-rate. Wasted-spend terms are the negative-keyword list.</div>
        <IntelTable rows={data.keyword_intel} label="Search term" />
      </div>

      <div className="card">
        <h3>Creative intelligence</h3>
        <div className="sub">Creatives compared by downstream CVR (not CTR), grouped by hook / format / theme.</div>
        <div className="empty" style={{ lineHeight: 1.6 }}>
          <b style={{ color: 'var(--txt-2)' }}>Schema-ready — not connected.</b><br />
          This PostHog project captures no creative-asset metadata (<span className="lp">hook_type</span>,{' '}
          <span className="lp">format</span>, <span className="lp">message_theme</span>). The{' '}
          <span className="lp">creative</span> table + <span className="lp">downstream_cvr</span> signal exist in the taxonomy
          (v0.0, unconnected). Connect the Google Ads creative feed to populate this panel — the same downstream-outcome
          engine already running on campaigns and keywords will light it up. Not fabricated.
        </div>
      </div>
    </>
  )
}

function IntelTable({ rows, label }) {
  const maxLeads = Math.max(...rows.map((r) => r.leads))
  return (
    <table>
      <thead>
        <tr><th>{label}</th><th>Visitors</th><th>Conversions</th><th>Conv. rate</th><th>Avg scroll</th><th>Flag</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td style={{ maxWidth: 260 }}><span className="lp">{r.key}</span></td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="tnum">{fmt(r.leads)}</span>
                <span style={{ flex: 1, maxWidth: 70, height: 6, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: pct(r.leads / maxLeads, 0), background: 'var(--line-2)' }} />
                </span>
              </div>
            </td>
            <td className="tnum">{fmt(r.qualified)}</td>
            <td><span style={{ color: cvrColor(r.qualified_rate, 0.1), fontWeight: 700 }}>{pct(r.qualified_rate)}</span></td>
            <td className="tnum">{r.avg_scroll}%</td>
            <td>
              {r.wasted_spend_flag && <span className="chip bad">wasted spend</span>}
              {r.scale_flag && <span className="chip conv">scale</span>}
              {!r.wasted_spend_flag && !r.scale_flag && <span style={{ color: 'var(--txt-3)' }}>—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
