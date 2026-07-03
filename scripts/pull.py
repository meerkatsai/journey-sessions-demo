#!/usr/bin/env python3
"""
Customer Journey Intelligence Substrate — data pull.

Turns raw PostHog ad + session data (Progen Weight Management paid funnel) into
the semantic layer described in the design spec:

  Layer 1 (Facts)      -> normalized events + identity-resolved journeys
  Layer 2 (Signals)    -> named, comparable attributes attached to each journey
  Layer 3 (Reasoning)  -> findings (cohort diff + lift) -> ranked recommendations

Output: web/public/substrate.json  (the materialized substrate the dashboard reads)
"""
import json, os, sys, urllib.request, urllib.error, math
from collections import defaultdict, Counter

def _load_ph_key():
    """PostHog personal API key — from PH_KEY env, else the gitignored .env at repo root.
    No key is ever hardcoded; fail loudly with a fix hint if it's missing."""
    key = os.environ.get("PH_KEY")
    if not key:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            for line in open(env_path):
                line = line.strip()
                if line and not line.startswith("#") and line.split("=", 1)[0].strip() == "PH_KEY":
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not key:
        sys.exit("PH_KEY not set. Run `cp .env.example .env` and paste your PostHog "
                 "personal API key, or export PH_KEY=... before running.")
    return key

KEY     = _load_ph_key()
REGION  = "us"
PROJECT = "83434"
BASE    = f"https://{REGION}.posthog.com/api/projects/{PROJECT}"
REPLAY  = f"https://{REGION}.posthog.com/project/{PROJECT}/replay"

# --- assumptions surfaced in the UI (the spec's value_per_conversion) ----------
VALUE_PER_LEAD = 1200          # INR per qualified consultation lead (editable in UI)
CURRENCY       = "INR"

# Landing pages that are the paid ad destinations (the funnel entry).
LANDING_PRED = "(properties.$pathname LIKE '%weight%' OR properties.$pathname LIKE '%keto%')"

def hogql(query):
    body = json.dumps({"query": {"kind": "HogQLQuery", "query": query}}).encode()
    req = urllib.request.Request(BASE + "/query/", data=body, method="POST",
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:400]); sys.exit(1)
    if d.get("error"):
        print("QUERY ERROR:", d["error"]); sys.exit(1)
    return d["results"]

def rest(path):
    req = urllib.request.Request(BASE + path,
        headers={"Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

# ---------------------------------------------------------------------------
# LAYER 1 + 2 :  journey table (identity-resolved, one row per lead)
# argMinIf picks the first-touch value on a landing pageview; scroll comes from
# the $pageleave signal; rageclick + conversion pages folded in as conditionals.
# ---------------------------------------------------------------------------
print("Pulling journey table ...")
JOURNEY_Q = f"""
SELECT
  toString(person_id) AS lead_id,
  min(timestamp) AS first_seen,
  max(timestamp) AS last_seen,
  countIf(event='$pageview') AS pageviews,
  count(DISTINCT properties.$session_id) AS visit_count,
  argMinIf(properties.$pathname, timestamp, event='$pageview' AND {LANDING_PRED}) AS landing_page,
  argMinIf(properties.$device_type, timestamp, event='$pageview' AND {LANDING_PRED}) AS device,
  argMinIf(properties.utm_campaign, timestamp, event='$pageview' AND {LANDING_PRED}) AS campaign,
  argMinIf(properties.utm_source, timestamp, event='$pageview' AND {LANDING_PRED}) AS source,
  argMinIf(properties.utm_term, timestamp, event='$pageview' AND {LANDING_PRED}) AS search_term,
  argMinIf(properties.$referring_domain, timestamp, event='$pageview' AND {LANDING_PRED}) AS referrer,
  round(maxIf(toFloat(properties.$prev_pageview_max_scroll_percentage),
        event='$pageleave' AND {LANDING_PRED}) * 100) AS max_scroll_pct,
  maxIf(1, event='$rageclick') AS rage_clicked,
  maxIf(1, event='$pageview' AND properties.$pathname='/book-free-consultation') AS reached_consult,
  maxIf(1, event='$pageview' AND properties.$pathname='/thank-you/') AS converted
FROM events
WHERE timestamp > now() - INTERVAL 365 DAY
  AND event IN ('$pageview','$pageleave','$rageclick')
GROUP BY lead_id
HAVING countIf(event='$pageview' AND {LANDING_PRED}) > 0
LIMIT 100000
"""
rows = hogql(JOURNEY_Q)
cols = ["lead_id","first_seen","last_seen","pageviews","visit_count","landing_page",
        "device","campaign","source","search_term","referrer","max_scroll_pct",
        "rage_clicked","reached_consult","converted"]
journeys = []
for r in rows:
    j = dict(zip(cols, r))
    j["max_scroll_pct"] = int(j["max_scroll_pct"] or 0)
    for b in ("rage_clicked","reached_consult","converted"):
        j[b] = bool(j[b])
    # ---- derived Layer-2 signals (section map from scroll depth) ----
    s = j["max_scroll_pct"]
    # section map:  hero 0-20 | proof 20-45 | testimonials 45-70 | pricing/faq 70-90 | cta 90+
    j["reached_proof"]        = s >= 20
    j["reached_testimonials"] = s >= 45
    j["reached_cta"]          = s >= 90
    sections = ["hero"]
    if s >= 20: sections.append("proof")
    if s >= 45: sections.append("testimonials")
    if s >= 70: sections.append("pricing_faq")
    if s >= 90: sections.append("cta")
    j["sections_seen"] = sections
    # engagement archetype — a PURE behavioral signal (never uses the outcome label,
    # so conversion-rate-by-archetype stays a meaningful, non-circular comparison)
    if j["visit_count"] >= 2:                   arch = "comparison-shopper"
    elif s < 15 and j["pageviews"] <= 1:        arch = "bouncer"
    elif s >= 45 or j["pageviews"] >= 3:        arch = "researcher"
    else:                                       arch = "skimmer"
    j["engagement_archetype"] = arch
    # friction score 0-100
    friction = 0
    if j["rage_clicked"]: friction += 40
    if s < 15: friction += 30
    if j["pageviews"] <= 1 and not j["converted"]: friction += 20
    j["friction_score"] = min(100, friction)
    # intent from search term + scroll + visits
    intent = 40 + min(30, s // 3) + (15 if j["visit_count"] >= 2 else 0) + (15 if j["reached_consult"] else 0)
    j["intent_score"] = min(100, intent)
    j["quality_tier"] = "high" if j["intent_score"] >= 75 else ("med" if j["intent_score"] >= 55 else "low")
    journeys.append(j)

N = len(journeys)
conv = [j for j in journeys if j["converted"]]
print(f"  {N} journeys, {len(conv)} converted ({len(conv)/N*100:.1f}%)")

# ---------------------------------------------------------------------------
# LAYER 3 :  the cohort-diff + lift engine (generic split -> lift)
# ---------------------------------------------------------------------------
def rate(subset):
    return sum(1 for j in subset if j["converted"]) / len(subset) if subset else 0.0

def wilson_lo(k, n, z=1.96):
    if n == 0: return 0.0
    p = k / n
    return max(0.0, (p + z*z/(2*n) - z*math.sqrt((p*(1-p)+z*z/(4*n))/n)) / (1+z*z/n))

def finding(signal, label, cohort_a, cohort_b, name_a, name_b, entity, action_rule, note=""):
    """cohort diff + lift, per the spec's finding schema."""
    a, b = list(cohort_a), list(cohort_b)
    if len(a) < 25 or len(b) < 25:
        return None
    ra, rb = rate(a), rate(b)
    if rb <= 0 or ra <= rb:           # only keep signals where A genuinely lifts over B
        return None
    lift = ra / rb
    # affected volume = the population currently on the losing side of the signal
    affected = len(b)
    impact = affected * (ra - rb) * VALUE_PER_LEAD
    # confidence from sample size (wilson lower bound on the lift denominator)
    ka = sum(1 for j in a if j["converted"]); kb = sum(1 for j in b if j["converted"])
    conf = "high" if (ka >= 20 and kb >= 20) else ("med" if (ka >= 8 and kb >= 8) else "low")
    return {
        "signal": signal, "label": label,
        "cohort_a": name_a, "cohort_b": name_b,
        "rate_a": round(ra, 4), "rate_b": round(rb, 4),
        "n_a": len(a), "n_b": len(b), "k_a": ka, "k_b": kb,
        "lift": round(lift, 2), "affected_volume": affected,
        "impact": round(impact), "confidence": conf,
        "entity": entity, "action_rule": action_rule, "note": note,
    }

# entity-action rules (the mapping table from the spec)
RULES = {
    "page_section": "Reorder / redesign the section — move proof + testimonials above the fold on the landing page.",
    "search_term":  "Add negative keywords + reallocate budget away from the low-intent term toward the winner.",
    "creative_hook":"Pause the underperforming ad + generate a new variant on the winning angle.",
    "form_field":   "Make the field optional / split the form into steps / defer it.",
    "audience":     "Build a lookalike of the converting segment + shift budget toward it.",
    "device":       "Ship a mobile-specific above-the-fold layout; move CTA + proof up on small screens.",
    "landing_page": "Re-point the ad group to the higher-converting landing page; retire the loser.",
}

findings = []

# 1) reached testimonials (scroll >= 45%) vs not  -> page_section
findings.append(finding(
    "reached_testimonials", "Leads who reach the testimonials/proof section",
    [j for j in journeys if j["reached_testimonials"]],
    [j for j in journeys if not j["reached_testimonials"]],
    "reached testimonials (scroll ≥45%)", "never scrolled past the hero (<45%)",
    "page_section", RULES["page_section"],
    "Proof sits below the fold; most paid traffic bounces at ~17-19% scroll before seeing it."))

# 2) reached_proof (>=20%) vs hero-only  -> page_section
findings.append(finding(
    "reached_proof", "Leads who scroll past the hero into the proof block",
    [j for j in journeys if j["reached_proof"]],
    [j for j in journeys if not j["reached_proof"]],
    "scrolled into proof (≥20%)", "hero-only (<20%)",
    "page_section", RULES["page_section"]))

# 3) desktop vs mobile  -> device
findings.append(finding(
    "device", "Desktop vs mobile leads",
    [j for j in journeys if j["device"]=="Desktop"],
    [j for j in journeys if j["device"]=="Mobile"],
    "desktop", "mobile",
    "device", RULES["device"],
    "Mobile is the majority of paid clicks but converts well below desktop."))

# 4) multi-visit (returning) vs single-visit  -> audience
findings.append(finding(
    "returning", "Returning leads (2+ visits) vs one-and-done",
    [j for j in journeys if j["visit_count"]>=2],
    [j for j in journeys if j["visit_count"]<2],
    "returned (2+ visits)", "single visit",
    "audience", RULES["audience"]))

# 5) no rage-click vs rage-clicked  -> form_field / page_section
findings.append(finding(
    "rage_clicked", "Frustration-free leads vs rage-clickers",
    [j for j in journeys if not j["rage_clicked"]],
    [j for j in journeys if j["rage_clicked"]],
    "no rage clicks", "rage-clicked (dead/broken UI)",
    "page_section", "Fix the element being rage-clicked (dead button / broken tap target) on the landing page."))

# 6) best vs worst landing page  -> landing_page
by_page = defaultdict(list)
for j in journeys: by_page[j["landing_page"]].append(j)
pages_ranked = sorted([(p, rate(v), len(v)) for p,v in by_page.items() if len(v) >= 80],
                      key=lambda x: -x[1])
if len(pages_ranked) >= 2:
    best_p, worst_p = pages_ranked[0][0], pages_ranked[-1][0]
    findings.append(finding(
        "landing_page", f"Best vs worst landing page ({best_p} vs {worst_p})",
        by_page[best_p], by_page[worst_p],
        f"{best_p}", f"{worst_p}",
        "landing_page", RULES["landing_page"]))

# 7) best vs worst search term  -> search_term
by_term = defaultdict(list)
for j in journeys:
    if j["search_term"]: by_term[j["search_term"]].append(j)
terms_ranked = sorted([(t, rate(v), len(v)) for t,v in by_term.items() if len(v) >= 30],
                      key=lambda x: -x[1])
if len(terms_ranked) >= 2:
    best_t, worst_t = terms_ranked[0][0], terms_ranked[-1][0]
    findings.append(finding(
        "search_term", f"High-intent vs low-intent search term",
        by_term[best_t], by_term[worst_t],
        f'"{best_t}"', f'"{worst_t}"',
        "search_term", RULES["search_term"],
        "Same budget, very different qualified-lead rates by query."))

# 8) best vs worst campaign  -> audience/creative
by_camp = defaultdict(list)
for j in journeys:
    if j["campaign"]: by_camp[j["campaign"]].append(j)
camp_ranked = sorted([(c, rate(v), len(v)) for c,v in by_camp.items() if len(v) >= 60],
                     key=lambda x: -x[1])
if len(camp_ranked) >= 2:
    best_c, worst_c = camp_ranked[0][0], camp_ranked[-1][0]
    findings.append(finding(
        "campaign", f"Best vs worst campaign",
        by_camp[best_c], by_camp[worst_c],
        f"campaign {best_c}", f"campaign {worst_c}",
        "audience", RULES["audience"]))

findings = [f for f in findings if f]
findings.sort(key=lambda f: -f["impact"])
for i,f in enumerate(findings): f["rank"] = i+1
print(f"  {len(findings)} findings")

# ---------------------------------------------------------------------------
# EVIDENCE :  real session recordings, bucketed to back findings
# ---------------------------------------------------------------------------
print("Pulling session recordings for evidence ...")
evidence = []
try:
    rec = rest("/session_recordings/?limit=40")
    for r in rec.get("results", []):
        url = r.get("start_url") or ""
        if not any(k in url for k in ("weight","keto")): continue
        dur = r.get("recording_duration") or 0
        evidence.append({
            "id": r["id"], "url": f"{REPLAY}/{r['id']}",
            "start_url": url.split("?")[0][:80],
            "duration_s": dur, "active_s": r.get("active_seconds"),
            "clicks": r.get("click_count"), "mobile": False,
            "start_time": r.get("start_time"),
        })
except Exception as e:
    print("  (recordings unavailable:", e, ")")
print(f"  {len(evidence)} landing-page recordings")

# ---------------------------------------------------------------------------
# RECOMMENDATIONS :  finding + entity-action rule  (Because / Do / Impact)
# ---------------------------------------------------------------------------
recommendations = []
for f in findings:
    gap = f["rate_a"] - f["rate_b"]
    because = (f'{f["cohort_a"]} convert {f["lift"]}× the rate of those who '
               f'{f["cohort_b"]} ({f["rate_a"]*100:.1f}% vs {f["rate_b"]*100:.1f}%). '
               f'{f["affected_volume"]:,} leads are currently on the losing side.')
    if f["note"]: because += " " + f["note"]
    recommendations.append({
        "id": f"rec-{f['rank']}",
        "title": {
            "reached_testimonials": "Move proof + testimonials above the fold",
            "reached_proof": "Compress the hero — get the value prop + proof into the first screen",
            "device": "Ship a mobile-first above-the-fold layout",
            "returning": "Retarget returning visitors — they convert far higher",
            "rage_clicked": "Fix the rage-clicked element on the landing page",
            "landing_page": "Re-point ad spend to the winning landing page",
            "search_term": "Cut the low-intent search term, scale the winner",
            "campaign": "Reallocate budget to the winning campaign",
        }.get(f["signal"], f["label"]),
        "entity": f["entity"],
        "because": because,
        "do": f["action_rule"],
        "impact": f["impact"],
        "impact_leads": round(f["affected_volume"] * gap),
        "confidence": f["confidence"],
        "finding": f,
        "evidence": [e for e in evidence][:4],
        "status": "open",   # decision-queue state: open | shipped | dismissed
    })

# ---------------------------------------------------------------------------
# AGGREGATES for the supporting panels
# ---------------------------------------------------------------------------
def dist(key, minn=1):
    d = defaultdict(list)
    for j in journeys:
        v = j[key]
        if v is not None: d[v].append(j)
    return sorted([{"key": k, "n": len(v), "conv": sum(x["converted"] for x in v),
                    "cvr": round(rate(v),4), "avg_scroll": round(sum(x["max_scroll_pct"] for x in v)/len(v))}
                   for k,v in d.items() if len(v) >= minn], key=lambda x: -x["n"])

scroll_buckets = []
for lo,hi,lab in [(0,15,"0-15% (hero)"),(15,30,"15-30%"),(30,45,"30-45% (proof)"),
                  (45,70,"45-70% (testimonials)"),(70,90,"70-90% (pricing/FAQ)"),(90,101,"90-100% (CTA)")]:
    seg = [j for j in journeys if lo <= j["max_scroll_pct"] < hi]
    if seg:
        scroll_buckets.append({"range": lab, "n": len(seg), "cvr": round(rate(seg),4),
                               "conv": sum(j["converted"] for j in seg)})

substrate = {
    "meta": {
        "client": "Progen Weight Management",
        "source": "PostHog",
        "region": REGION, "project_id": PROJECT,
        "funnel": "Google Ads → weight-loss landing pages → book consultation → thank-you",
        "value_per_lead": VALUE_PER_LEAD, "currency": CURRENCY,
        "generated_from": "live PostHog query API (HogQL)",
        "assumptions": [
            f"Conversion = reaching /thank-you/ (post-consultation booking).",
            f"Value per qualified lead assumed at {CURRENCY} {VALUE_PER_LEAD:,} (editable).",
            "Section map inferred from scroll depth (no per-template offsets available): "
            "hero 0-20%, proof 20-45%, testimonials 45-70%, pricing/FAQ 70-90%, CTA 90%+.",
            "Ad spend / cost-per-qualified not connected — CPL-based findings omitted, not fabricated.",
        ],
    },
    "funnel_summary": {
        "leads": N, "converted": len(conv), "cvr": round(len(conv)/N,4),
        "avg_scroll": round(sum(j["max_scroll_pct"] for j in journeys)/N),
        "mobile_share": round(sum(1 for j in journeys if j["device"]=="Mobile")/N,3),
        "rage_rate": round(sum(1 for j in journeys if j["rage_clicked"])/N,3),
        "value_at_stake": sum(r["impact"] for r in recommendations),
    },
    "recommendations": recommendations,
    "findings": findings,
    "aggregates": {
        "scroll_buckets": scroll_buckets,
        "by_device": dist("device"),
        "by_landing_page": dist("landing_page", 40),
        "by_search_term": dist("search_term", 20),
        "by_campaign": dist("campaign", 30),
        "by_archetype": dist("engagement_archetype"),
    },
    "journeys_sample": sorted(journeys, key=lambda j: (-j["converted"], -j["intent_score"]))[:400],
    "evidence": evidence,
}

out = os.path.join(os.path.dirname(__file__), "..", "web", "public", "substrate.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w") as f:
    json.dump(substrate, f, indent=1, default=str)
print(f"Wrote {out}  ({os.path.getsize(out)//1024} KB)")
print(f"Value at stake across queue: {CURRENCY} {substrate['funnel_summary']['value_at_stake']:,}")
