# Journey Intelligence — Data Spine demo

A clickable demo of two **Data Spine** surfaces inside the Meerkats.ai product shell:

- **Sessions** (live) — real-time PostHog web-session intelligence for the Progen
  Weight Management paid funnel: funnel-leak detection, converter diffs, a ranked
  decision queue, session replays, and a grounded analyst agent.
- **Identities** (mock) — a faithful mock of the product's Identities page, plus a
  proposed **Session Data** panel that shows each contact's web sessions joined by email.

> Sessions = **real data**. Identities + the per-contact Session Data panel = **mock**,
> for showing a developer how it should look before building it in the product.

---

## Run it locally (with Claude Code or plain npm)

```bash
cd web
npm install
npm run dev        # → http://localhost:5199
```

That's it. The dashboard reads a **committed data snapshot** (`web/public/substrate.json`),
so the whole demo works offline with **no API key**. Open the app and click between
**Data Spine → Identities** and **Data Spine → Sessions** in the left nav.

### Optional: live re-pull from PostHog
The **Refresh** button and the **Range** picker (7/14/30/45/90 days) in the Sessions
tab re-query PostHog. They need a key:

```bash
cp .env.example .env      # paste your PostHog personal API key into PH_KEY
```

Without a key, the snapshot still renders — only Refresh/Range are disabled.
See [REFRESH.md](REFRESH.md) for the refresh endpoint and the nightly cron.

---

## The key idea: session data on an identity

Each Meerkats identity (e.g. *Bushra Patel*, `bushrapatel85@gmail.com`) gets a
**Session Data** panel showing that contact's PostHog web sessions — scroll depth,
sections reached, device, rage-clicks, intent, replay links, and a session
buyer-journey timeline.

**How the join works (for the developer):**
PostHog tags identified visitors with their email on `lead_form_submitted` /
`$identify` (`$user_id: "…@gmail.com"`). Meerkats contacts already carry email +
phone. So we join **PostHog `person_id` ↔ Meerkats contact on email** (phone as
fallback). Only identified visitors match — which is exactly who your contacts are;
anonymous traffic stays in the aggregate **Sessions** tab.

In production, the per-identity panel reads the same substrate the Sessions tab
builds (`scripts/pull_v2.py`), keyed by email. In this demo it's mocked in
[`web/src/lib/mockIdentities.js`](web/src/lib/mockIdentities.js).

---

## Layout

```
web/src/
  App.jsx                 Meerkats product shell (sidebar + section routing)
  product/
    Identities.jsx        Identities page (MOCK) — contact list + identity detail
    SessionPanel.jsx      per-contact Session Data panel (MOCK) — the proposal
    SessionsView.jsx      Sessions tab = the live dashboard (REAL)
  screens/                dashboard screens (command center, diff, journeys, …)
  lib/mockIdentities.js   mock contacts + mock session data
  components/AgentChat.jsx grounded analyst agent
scripts/
  pull_v2.py              builds web/public/substrate.json from PostHog (REAL)
  refresh.sh              wrapper used by the refresh endpoint + nightly cron
```

Real vs mock at a glance: **Sessions tab + `pull_v2.py` + `substrate.json` = real
PostHog.** Everything under `product/Identities.jsx`, `product/SessionPanel.jsx`,
and `lib/mockIdentities.js` = mock for the demo.
