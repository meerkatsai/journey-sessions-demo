import { useState } from 'react'
import { fmt, pct, cvrColor } from '../lib/format.js'

export default function ConverterDiff({ data, ctx }) {
  const [page, setPage] = useState(data.converter_diff[0].page)
  const d = data.converter_diff.find((x) => x.page === page)
  const sections = data.section_map.map((s) => s.name)

  return (
    <>
      <p className="pageintro">
        For each landing page, the section-by-section scroll comparison of <b style={{ color: 'var(--good)' }}>converters</b> vs{' '}
        <b style={{ color: 'var(--txt-2)' }}>non-converters</b> — where the two cohorts diverge is where the page loses the sale.
        Top differentiating signals are ranked by lift; each row drills to evidence.
      </p>

      <div className="filters">
        <label style={{ fontSize: 12, color: 'var(--txt-3)' }}>Landing page:</label>
        <select value={page} onChange={(e) => setPage(e.target.value)}>
          {data.converter_diff.map((x) => (
            <option key={x.page} value={x.page}>{x.page} — {pct(x.cvr)} CVR, {fmt(x.n)} visitors</option>
          ))}
        </select>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Section reach — converters vs non-converters</h3>
          <div className="sub">% of each cohort that scrolled to each section on {page}.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 8, fontSize: 10, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            <span>Section</span><span style={{ color: 'var(--good)' }}>Converters ({fmt(d.converters)})</span><span>Non-conv ({fmt(d.n - d.converters)})</span>
          </div>
          {sections.map((s) => (
            <div className="sec-diff" key={s}>
              <span className="snm">{s.replace('_', '/')}</span>
              <div className="dbar a"><i style={{ width: pct(d.sections_converters[s], 0) }} /><span>{pct(d.sections_converters[s], 0)}</span></div>
              <div className="dbar b"><i style={{ width: pct(d.sections_nonconverters[s], 0) }} /><span>{pct(d.sections_nonconverters[s], 0)}</span></div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 12, lineHeight: 1.5 }}>
            The gap opens at <b style={{ color: 'var(--txt) ' }}>proof</b>: converters reach it at{' '}
            {pct(d.sections_converters.proof, 0)} vs {pct(d.sections_nonconverters.proof, 0)} of non-converters. Everything
            below the fold barely gets seen by either — the decision is made in the first screen.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <h3>Top differentiating signals (by lift)</h3>
            <div className="sub">Within {page}, the signals most predictive of conversion.</div>
            {d.top_signals.length === 0 && <div className="empty">Not enough converters on this page for a stable diff.</div>}
            {d.top_signals.map((s) => (
              <div className="hbar" key={s.signal}>
                <div className="k">{s.signal}</div>
                <div className="hbar-track"><div className="hbar-fill" style={{ width: pct(Math.min(1, s.lift / (d.top_signals[0].lift || 1)), 0), background: cvrColor(s.cvr_a, d.top_signals[0].cvr_a) }} /></div>
                <div className="val"><b>{s.lift}×</b> · {pct(s.cvr_a, 0)}/{pct(s.cvr_b, 0)}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>Dimension breakdown — by device</h3>
            <div className="sub">CVR by device on {page}.</div>
            {d.by_device.map((b) => (
              <div className="hbar" key={b.key}>
                <div className="k">{b.key}</div>
                <div className="hbar-track"><div className="hbar-fill" style={{ width: pct(Math.min(1, b.cvr / (d.cvr * 2 || 0.1)), 0), background: cvrColor(b.cvr, d.cvr * 1.5) }} /></div>
                <div className="val"><b>{pct(b.cvr)}</b> · {fmt(b.n)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>All landing pages ranked</h3>
        <div className="sub">Same ad budget, different conversion rates — the re-point candidates.</div>
        <table>
          <thead><tr><th>Landing page</th><th>Visitors</th><th>Conversions</th><th>CVR</th><th>Proof reach (conv/non)</th></tr></thead>
          <tbody>
            {[...data.converter_diff].sort((a, b) => b.cvr - a.cvr).map((x) => (
              <tr key={x.page} className="clickable" onClick={() => setPage(x.page)}>
                <td><span className="lp">{x.page}</span></td>
                <td className="tnum">{fmt(x.n)}</td>
                <td className="tnum">{fmt(x.converters)}</td>
                <td><span style={{ color: cvrColor(x.cvr, 0.1), fontWeight: 700 }}>{pct(x.cvr)}</span></td>
                <td className="tnum">{pct(x.sections_converters.proof, 0)} / {pct(x.sections_nonconverters.proof, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
