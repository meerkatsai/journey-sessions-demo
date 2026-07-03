import { useState, useRef, useEffect } from 'react'
import { groundedAnswer, llmAnswer, handoffPrompt, recAnswer } from '../lib/agent.js'
import { fmt, pct } from '../lib/format.js'

export default function AgentChat({ data, handoff, clearHandoff, onOpenRec }) {
  const [msgs, setMsgs] = useState([
    { role: 'bot', payload: groundedAnswer('__intro__', data) },
  ])
  const [input, setInput] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [useLLM, setUseLLM] = useState(false)
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef(null)

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight) }, [msgs, busy])

  // card-to-chat handoff (S9.2) — passes rec context so the agent doesn't re-derive
  useEffect(() => {
    if (handoff) {
      const q = handoffPrompt(handoff.kind, handoff.ctx)
      setMsgs((m) => [...m, { role: 'user', text: q },
        { role: 'bot', payload: recAnswer(handoff.kind, handoff.ctx, data) }])
      clearHandoff()
    }
  }, [handoff])

  async function ask(text) {
    if (!text.trim()) return
    setMsgs((m) => [...m, { role: 'user', text }])
    setInput('')
    if (useLLM && apiKey) {
      setBusy(true)
      try {
        const out = await llmAnswer(text, data, apiKey)
        setMsgs((m) => [...m, { role: 'bot', payload: { text: out } }])
      } catch (e) {
        setMsgs((m) => [...m, { role: 'bot', payload: { text: 'LLM error — ' + e.message + '. Falling back to grounded engine:' } },
          { role: 'bot', payload: groundedAnswer(text, data) }])
      } finally { setBusy(false) }
    } else {
      setTimeout(() => setMsgs((m) => [...m, { role: 'bot', payload: groundedAnswer(text, data) }]), 120)
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div className="ti">✦ Analyst agent
          <span className="mode">{useLLM && apiKey ? 'Claude API' : 'grounded engine'}</span>
        </div>
      </div>
      <div className="chat-body" ref={bodyRef}>
        {msgs.map((m, i) =>
          m.role === 'user'
            ? <div className="msg user" key={i}>{m.text}</div>
            : <BotMsg key={i} payload={m.payload} ask={ask} onOpenRec={onOpenRec} />
        )}
        {busy && <div className="msg bot">Thinking…</div>}
      </div>
      <div className="chat-foot">
        <div className="chat-input">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about the journey…"
            onKeyDown={(e) => e.key === 'Enter' && ask(input)} />
          <button onClick={() => ask(input)}>↑</button>
        </div>
        <div className="keyrow">
          <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={useLLM} onChange={(e) => setUseLLM(e.target.checked)} style={{ width: 'auto', flex: 'none' }} />
            full NL
          </label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="paste Anthropic key (sk-ant-…) to upgrade" />
        </div>
      </div>
    </div>
  )
}

function BotMsg({ payload: p, ask, onOpenRec }) {
  return (
    <div className="msg bot">
      <span dangerouslySetInnerHTML={{ __html: mdBold(p.text) }} />
      {p.code && (
        <pre style={{ marginTop: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontFamily: 'var(--mono)', fontSize: 10.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: 'var(--txt)' }}>{p.code}</pre>
      )}
      {p.diff && (
        <div style={{ marginTop: 8 }}>
          {p.diff.map((d) => (
            <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '3px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--txt-2)' }}>{d.signal}</span>
              <span><b style={{ color: 'var(--good)' }}>{d.lift.toFixed(1)}×</b> <span style={{ color: 'var(--txt-3)' }}>{pct(d.a_share, 0)}/{pct(d.b_share, 0)}</span></span>
            </div>
          ))}
        </div>
      )}
      {p.followup && <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: mdBold(p.followup) }} />}
      {p.rec && (
        <div className="mrec" onClick={() => onOpenRec?.(p.rec)} style={{ cursor: 'pointer' }}>
          <div className="mt">▸ #{p.rec.rank} {p.rec.title}</div>
          <div className="mi">+{fmt(p.rec.incremental_leads)} conversions/mo · {p.rec.confidence} confidence</div>
        </div>
      )}
      {p.evidence && p.evidence.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {p.evidence.map((e) => (
            <a key={e.id} href={e.url} target="_blank" rel="noreferrer"
              style={{ display: 'block', fontSize: 11, color: 'var(--accent)', padding: '2px 0' }}>▶ replay · {e.path} ({e.duration_s}s)</a>
          ))}
        </div>
      )}
      {p.suggest && (
        <div className="suggest">
          {p.suggest.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}
        </div>
      )}
    </div>
  )
}

const mdBold = (t = '') => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
