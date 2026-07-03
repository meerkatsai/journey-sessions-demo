# Refreshing the substrate

The dashboard reads a static `web/public/substrate.json` built by `scripts/pull_v2.py`
from the live PostHog HogQL API. Three ways to refresh it, all sharing one wrapper
(`scripts/refresh.sh`) and one secret (`PH_KEY`).

## Secret

The PostHog personal API key is **not** hardcoded. It's read from `PH_KEY` (env var),
falling back to the gitignored `.env` at the repo root.

```bash
cp .env.example .env      # then paste your real key into .env
```

`scripts/pull.py` and `scripts/pull_v2.py` both exit with a hint if `PH_KEY` is missing.

## 1. Manual

```bash
bash scripts/refresh.sh          # loads .env, runs pull_v2.py, logs to logs/refresh.log
```

## 2. On-demand from the dashboard (dev server)

While `npm run dev` is running, the topbar **⟳ Refresh** button POSTs `/api/refresh`.
That endpoint (a Vite middleware in `web/vite.config.js`) runs `scripts/refresh.sh`
and the dashboard reloads the rewritten `substrate.json`. The button's tooltip shows
the last `generated_at`.

## 3. Nightly (launchd, macOS)

Runs `scripts/refresh.sh` every night at 03:00.

```bash
# install
cp scripts/com.progen.journey-substrate.refresh.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.progen.journey-substrate.refresh.plist

# run once now to verify
launchctl start com.progen.journey-substrate.refresh
tail -f logs/refresh.log

# uninstall
launchctl unload ~/Library/LaunchAgents/com.progen.journey-substrate.refresh.plist
rm ~/Library/LaunchAgents/com.progen.journey-substrate.refresh.plist
```

Logs: `logs/refresh.log` (pull output) and `logs/launchd.{out,err}.log` (scheduler).
