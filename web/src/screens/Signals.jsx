// The versioned signal taxonomy — the contract between data and agents (PRD S1.3).
export default function Signals({ data, ctx }) {
  const defs = data.signal_definitions
  const entities = ['journey', 'session_event', 'creative', 'campaign']
  return (
    <>
      <p className="pageintro">
        The signal taxonomy is the contract between the data and the agents, and it is versioned. Each signal is named,
        typed, evidence-linked, and attached to an entity. Adding or changing a signal mints a new version; existing
        findings keep referencing the version they were computed against.
      </p>
      <div className="stat-inline" style={{ marginBottom: 16 }}>
        <div className="si"><div className="v">v{data.meta.taxonomy_version}</div><div className="l">taxonomy version</div></div>
        <div className="si"><div className="v">{defs.length}</div><div className="l">signals defined</div></div>
        <div className="si"><div className="v">{defs.filter((d) => d.v.startsWith('0')).length}</div><div className="l">unconnected (v0)</div></div>
        <div className="si"><div className="v">4</div><div className="l">entities</div></div>
      </div>

      {entities.map((ent) => {
        const rows = defs.filter((d) => d.entity === ent)
        if (!rows.length) return null
        return (
          <div className="card reg" key={ent} style={{ marginBottom: 14 }}>
            <h3 style={{ textTransform: 'capitalize' }}>{ent} signals</h3>
            <table>
              <thead><tr><th>Signal</th><th>Type</th><th>Compute rule</th><th>Evidence</th><th>Ver</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.name}>
                    <td><span className="nm">{d.name}</span></td>
                    <td style={{ color: 'var(--txt-2)' }}>{d.type}</td>
                    <td style={{ maxWidth: 380 }}>{d.rule}</td>
                    <td><span className="lp" style={{ fontSize: 10.5 }}>{d.evidence}</span></td>
                    <td><span className={d.v.startsWith('0') ? 'v0' : ''} style={{ fontWeight: 600 }}>{d.v}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </>
  )
}
