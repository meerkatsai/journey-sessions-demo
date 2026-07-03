// ---------------------------------------------------------------------------
// MOCK identity data for the Data Spine "Identities" page.
//
// This is DEMO/MOCK data only — it mirrors the real Meerkats product's identity
// shape (contact + funnel stage + events + memory + user journey) and adds the
// proposed **Session Data** block: PostHog web-session signals joined to a lead
// BY EMAIL. In production this block would be populated from the substrate the
// Sessions tab already builds (matched on `$user_id` / identify email). Here it
// is hand-mocked so a developer can see exactly how it should render.
// ---------------------------------------------------------------------------

const LANDING = [
  '/weight-loss-clinic-bangalore', '/keto-diet-program-bangalore',
  '/weight-loss-clinic-mumbai', '/program-blr', '/keto-plan',
]
const SOURCES = ['google', 'google', 'meta', 'google', 'direct']
const DEVICES = ['Mobile', 'Mobile', 'Desktop', 'Mobile', 'Desktop']

// deterministic pseudo-random from an integer seed (stable across reloads)
function rng(seed) {
  let s = seed * 2654435761 % 2147483647
  return () => (s = (s * 48271) % 2147483647) / 2147483647
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const fmtDur = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)

const SECTIONS = [
  { name: 'hero', at: 0 }, { name: 'proof', at: 20 }, { name: 'testimonials', at: 45 },
  { name: 'pricing_faq', at: 70 }, { name: 'cta', at: 90 },
]
const sectionsFor = (scroll) => SECTIONS.filter((s) => scroll >= s.at).map((s) => s.name)

// Build a mock session block for a lead. `matched` false => no PostHog identity
// resolved for this email (the honest, common case for un-tracked visitors).
function buildSessions(seed, matched, campaign) {
  if (!matched) return { matched: false }
  const r = rng(seed)
  const n = 1 + Math.floor(r() * 3) // 1..3 sessions
  const sessions = []
  let maxScroll = 0, totalTime = 0, rage = 0
  const base = new Date('2026-07-02T00:00:00Z').getTime()
  for (let i = 0; i < n; i++) {
    const scroll = Math.min(100, Math.round(15 + r() * 80))
    const dur = 20 + Math.floor(r() * 360)
    const pages = 1 + Math.floor(r() * 4)
    const rc = r() > 0.75 ? 1 : 0
    maxScroll = Math.max(maxScroll, scroll); totalTime += dur; rage += rc
    const day = new Date(base - i * 86400000 * (1 + Math.floor(r() * 3)))
    sessions.push({
      id: '019f' + (seed * 7 + i).toString(16).padStart(8, '0'),
      date: day.toISOString().slice(0, 10),
      device: pick(rng(seed + i), DEVICES),
      duration_s: dur, pages, max_scroll_pct: scroll,
      source: pick(rng(seed + i), SOURCES),
      campaign,
      rage_clicked: !!rc,
      landing: pick(rng(seed + i + 3), LANDING),
      replay_url: `https://us.posthog.com/project/83434/replay/019f${(seed * 7 + i).toString(16).padStart(8, '0')}`,
    })
  }
  const intent = Math.min(100, 40 + Math.round(maxScroll / 3) + (n >= 2 ? 15 : 0) + (rage ? -5 : 5))
  // a compact "session buyer journey" for the most engaged session
  const top = sessions[0]
  const timeline = [
    { t: '0:00', kind: 'pageview', label: `Landed · ${top.landing}`, section: 'hero' },
    { t: '0:04', kind: 'scroll', label: `Scrolled to ${Math.min(45, top.max_scroll_pct)}%`, section: 'proof' },
    ...(top.max_scroll_pct >= 45 ? [{ t: '0:38', kind: 'scroll', label: 'Reached testimonials', section: 'testimonials' }] : []),
    ...(top.rage_clicked ? [{ t: '0:52', kind: 'rage', label: 'Rage-click (dead element)', section: 'proof' }] : []),
    ...(top.max_scroll_pct >= 90 ? [{ t: '1:20', kind: 'cta', label: 'Reached CTA / booking', section: 'cta' }] : []),
    { t: fmtDur(top.duration_s), kind: 'form', label: 'lead_form_submitted', section: 'cta' },
  ]
  return {
    matched: true,
    matched_by: 'email',
    summary: {
      count: n, total_time_s: totalTime, total_time: fmtDur(totalTime),
      max_scroll_pct: maxScroll, device: sessions[0].device, rage_clicks: rage, intent_score: intent,
      sections_seen: sectionsFor(maxScroll),
    },
    sessions, timeline,
  }
}

const RAW = [
  ['Bushra Patel', 'con_yE0N4YfwjOps', 'bushrapatel85@gmail.com', '+918296278885', 'google', '23790238693', true],
  ['Prathana Mahendran', 'con_aLLeCoaNcg-7', 'prathana.m@gmail.com', '+919845012234', 'google', '23790238693', true],
  ['venkatesh Prasath', 'con_cfaWcmMW6ui_', 'venkatesh.prasath@gmail.com', '+917760043321', 'meta', '19022110045', true],
  ['Shruti jose', 'con_g58HvJdZTACN', 'shruti.jose@gmail.com', '+919611234509', 'google', '23790238693', true],
  ['Mohd Mubin', 'con_yuba8MClVFSk', 'mohd.mubin@gmail.com', '+918123398765', 'google', '23790238693', false],
  ['Prakhar Bhardwaj', 'con_34r6lb_c2Vdv', 'prakhar.b@gmail.com', '+919900556677', 'direct', '—', true],
  ['Arvind Kumar Sharma', 'con_bdYJ5APLtrmk', 'arvind.sharma@gmail.com', '+918050011223', 'meta', '19022110045', true],
  ['Nazia Sultana', 'con_xoSWrRc_6toB', 'nazia.sultana@gmail.com', '+917019887654', 'google', '23790238693', false],
  ['Raksha Nagesh', 'con_Z6cnieQnJU1c', 'raksha.nagesh@gmail.com', '+919480223311', 'google', '23790238693', true],
  ['Reshma begum', 'con_MnYxvtQouKuY', 'reshma.begum@gmail.com', '+918762109988', 'meta', '19022110045', true],
  ['Pankaj kumar', 'con_hBnWgVzgLl74', 'pankaj.kumar@gmail.com', '+919035667788', 'google', '23790238693', true],
  ['Lavanyaa Kannan', 'con_vlwt5t9ezSM9', 'lavanyaa.k@gmail.com', '+917338009911', 'google', '23790238693', true],
  ['Ishrat khan', 'con_U0kagdBo7wZZ', 'ishrat.khan@gmail.com', '+918884451200', 'meta', '19022110045', false],
  ['Sakshi', 'con_jXwCv_V5Z-_c', 'sakshi.r@gmail.com', '+919611002244', 'google', '23790238693', true],
  ['Sanjay', 'con_pQ2mNbVc8kL0', 'sanjay.rk@gmail.com', '+917760551122', 'direct', '—', true],
  ['Deepa Iyer', 'con_rT4kLmNp9wXy', 'deepa.iyer@gmail.com', '+919845660011', 'google', '23790238693', true],
  ['Farhan Ali', 'con_bV7hGtRs3zQm', 'farhan.ali@gmail.com', '+918050778899', 'meta', '19022110045', false],
  ['Kavya Reddy', 'con_wX9cVbNm2kHp', 'kavya.reddy@gmail.com', '+917019334455', 'google', '23790238693', true],
  ['Rohit Menon', 'con_yZ1dFgHj4lKn', 'rohit.menon@gmail.com', '+919900112233', 'google', '23790238693', true],
  ['Aisha Khan', 'con_cD3eRtYu5mNb', 'aisha.khan@gmail.com', '+918762445566', 'meta', '19022110045', true],
  ['Vikram Rao', 'con_fG5hJkLp6qWs', 'vikram.rao@gmail.com', '+919035889900', 'google', '23790238693', false],
  ['Neha Gupta', 'con_iH7jKlMn8rXt', 'neha.gupta@gmail.com', '+917338221133', 'google', '23790238693', true],
  ['Sameer Joshi', 'con_kJ9lMnOp0sYu', 'sameer.joshi@gmail.com', '+918884667788', 'direct', '—', true],
  ['Pooja Nair', 'con_mL1nOpQr2tZv', 'pooja.nair@gmail.com', '+919611778899', 'google', '23790238693', true],
  ['Imran Sheikh', 'con_oN3pQrSt4uAw', 'imran.sheikh@gmail.com', '+917760990011', 'meta', '19022110045', false],
  ['Tara Krishnan', 'con_qP5rStUv6wBx', 'tara.krishnan@gmail.com', '+919845221144', 'google', '23790238693', true],
]

const STAGES = ['Acquisition', 'Engagement', 'Intent', 'Activation', 'Retention', 'Expansion', 'Risk']

export const IDENTITIES = RAW.map(([name, id, email, phone, source, campaign, matched], i) => {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const session = buildSessions(i + 1, matched, campaign)
  // all contacts sit in Acquisition (mirrors the screenshot); session intent is the
  // richer signal and lives in the Session Data panel.
  const stageIdx = 0
  return {
    id, name, initials, email, phone,
    activated: false,
    high_risk: false,
    lead_source: source, campaign,
    center: '—', advisor: '—', program: '—', age: '—',
    funnel_stage: STAGES[stageIdx], stage_idx: stageIdx,
    events: [
      { type: 'engagement.form_submitted', date: 'Jul 3', actor: `${email} · ${phone} · ${name}`, fields: 17 },
    ],
    memory: { weeks: 0, weight_lost: 0, target: 0 },
    risk_score: 0,
    agent_notes: [],
    user_journey_count: session.matched ? 30 + (i % 12) : 0,
    session,
  }
})

export const STAGE_LIST = STAGES

export const CONTACTS_META = {
  workspace: 'Progen_method',
  total_contacts: IDENTITIES.length,
  total_events: IDENTITIES.reduce((a, c) => a + c.events.length + (c.session.summary?.count || 0), 0),
  activated: 0,
  high_risk: 0,
}
