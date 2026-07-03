#!/usr/bin/env python3
"""
Journey Intelligence Dashboard — substrate builder (v2, PRD-aligned).

Implements the three-layer architecture from the PRD:
  Layer 1 Facts     -> identity-resolved journeys (spine) + ordered session_event traces
  Layer 2 Signals   -> versioned signal taxonomy attached to entities (the substrate)
  Layer 3 Reasoning -> cohort-diff findings -> recommendations (because/do/impact/confidence)
                       + draft actions + funnel-leak + anomaly + creative/campaign intelligence

Output: web/public/substrate.json   (the server-driven ranked substrate the dashboard reads)
Source: live PostHog HogQL API — client "Progen Weight Management" paid weight-loss funnel.
"""
import json, os, sys, math, urllib.request, urllib.error
from collections import defaultdict
from datetime import datetime, timedelta

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
REGION, PROJECT = "us", "83434"
BASE   = f"https://{REGION}.posthog.com/api/projects/{PROJECT}"
REPLAY = f"https://{REGION}.posthog.com/project/{PROJECT}/replay"
VALUE_PER_LEAD, CURRENCY = 1200, "INR"
# Lookback window (days). Overridable via PULL_DAYS so the dashboard's Range
# picker can re-pull for a different window. Clamped to a sane range.
WINDOW_DAYS = max(1, min(365, int(os.environ.get("PULL_DAYS", "45") or "45")))
LANDING = "(properties.$pathname LIKE '%weight%' OR properties.$pathname LIKE '%keto%')"

# section map (PRD S1.4): ordered sections + scroll offsets for the LP template
SECTION_MAP = [
    ("hero", 0), ("proof", 20), ("testimonials", 45), ("pricing_faq", 70), ("cta", 90),
]
def sections_for(scroll):
    return [name for name, off in SECTION_MAP if scroll >= off] or ["hero"]

def hogql(query):
    body = json.dumps({"query": {"kind": "HogQLQuery", "query": query}}).encode()
    req = urllib.request.Request(BASE + "/query/", data=body, method="POST",
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:500]); sys.exit(1)
    if d.get("error"): print("QUERY ERROR:", d["error"]); sys.exit(1)
    return d["results"]

def rest(path):
    req = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=60) as r: return json.load(r)

# ============================ LAYER 1 — journeys (spine) ============================
# Split into two light queries (the 10s HogQL cap kills a single monolithic scan):
#   A) first-touch acquisition attributes over landing pageviews only  (~11k rows)
#   B) behavioral flags over the narrow pageleave/rageclick/conversion set
# then stitch per person_id in Python (identity resolution = PostHog person_id).
print("[1/6] journey table (A: acquisition) ...")
A = hogql(f"""
SELECT toString(person_id) AS lead_id,
  toString(min(timestamp)) AS first_seen,
  count() AS pageviews,
  count(DISTINCT properties.$session_id) AS visit_count,
  argMin(properties.$pathname, timestamp) AS landing_page,
  argMin(properties.$device_type, timestamp) AS device,
  argMin(properties.utm_campaign, timestamp) AS campaign,
  argMin(properties.utm_source, timestamp) AS source,
  argMin(properties.utm_term, timestamp) AS search_term,
  argMin(properties.$referring_domain, timestamp) AS referrer,
  argMin(properties.$session_id, timestamp) AS first_session
FROM events
WHERE timestamp > now() - INTERVAL {WINDOW_DAYS} DAY AND event='$pageview' AND {LANDING}
GROUP BY lead_id LIMIT 100000
""")
acq_cols = ["lead_id","first_seen","pageviews","visit_count","landing_page","device",
            "campaign","source","search_term","referrer","first_session"]
print(f"  A: {len(A)} funnel leads")
print("[1/6] journey table (B: behavior) ...")
B = hogql(f"""
SELECT toString(person_id) AS lead_id,
  toString(max(timestamp)) AS last_seen,
  round(maxIf(toFloat(properties.$prev_pageview_max_scroll_percentage), event='$pageleave')*100) AS max_scroll_pct,
  maxIf(1, event='$rageclick') AS rage_clicked,
  maxIf(1, event='$pageview' AND properties.$pathname='/book-free-consultation') AS reached_consult,
  maxIf(1, event='$pageview' AND properties.$pathname='/thank-you/') AS converted
FROM events
WHERE timestamp > now() - INTERVAL {WINDOW_DAYS} DAY
  AND (event='$rageclick'
       OR (event='$pageleave' AND {LANDING})
       OR (event='$pageview' AND properties.$pathname IN ('/book-free-consultation','/thank-you/')))
GROUP BY lead_id LIMIT 200000
""")
beh = {r[0]: {"last_seen": r[1], "max_scroll_pct": r[2], "rage_clicked": r[3],
              "reached_consult": r[4], "converted": r[5]} for r in B}
print(f"  B: {len(beh)} leads with behavioral events")
J = []
for r in A:
    j = dict(zip(acq_cols, r))
    b = beh.get(j["lead_id"], {})
    j["last_seen"] = b.get("last_seen", j["first_seen"])
    j["max_scroll_pct"] = max(0, min(100, int(b.get("max_scroll_pct") or 0)))
    j["rage_clicked"]   = bool(b.get("rage_clicked"))
    j["reached_consult"]= bool(b.get("reached_consult"))
    j["converted"]      = bool(b.get("converted"))
    s = j["max_scroll_pct"]
    j["sections_seen"]        = sections_for(s)
    j["reached_proof"]        = s >= 20
    j["reached_testimonials"] = s >= 45
    j["reached_cta"]          = s >= 90
    j["returning"]            = j["visit_count"] >= 2
    if j["visit_count"] >= 2:               arch = "comparison-shopper"
    elif s < 15 and j["pageviews"] <= 1:    arch = "bouncer"
    elif s >= 45 or j["pageviews"] >= 3:    arch = "researcher"
    else:                                    arch = "skimmer"
    j["engagement_archetype"] = arch
    friction = (40 if j["rage_clicked"] else 0) + (30 if s < 15 else 0) + \
               (20 if (j["pageviews"] <= 1 and not j["converted"]) else 0)
    j["friction_score"] = min(100, friction)
    j["intent_score"]   = min(100, 40 + min(30, s//3) + (15 if j["returning"] else 0) + (15 if j["reached_consult"] else 0))
    j["quality_tier"]   = "high" if j["intent_score"]>=75 else ("med" if j["intent_score"]>=55 else "low")
    j["date"] = j["first_seen"][:10]
    J.append(j)
N = len(J); CONV = [j for j in J if j["converted"]]
print(f"  {N} journeys, {len(CONV)} converted ({len(CONV)/N*100:.1f}%)")

def rate(sub): return sum(x["converted"] for x in sub)/len(sub) if sub else 0.0

# ============================ curated real timelines (journey explorer) ============================
print("[2/6] session_event traces for explorer ...")
featured = (sorted(CONV, key=lambda j:-j["intent_score"])[:40] +
            sorted([j for j in J if j["engagement_archetype"]=="bouncer"], key=lambda j:-j["pageviews"])[:20] +
            sorted([j for j in J if j["engagement_archetype"]=="researcher" and not j["converted"]], key=lambda j:-j["max_scroll_pct"])[:20] +
            sorted([j for j in J if j["rage_clicked"]], key=lambda j:-j["intent_score"])[:20])
seen=set(); featured=[j for j in featured if not (j["lead_id"] in seen or seen.add(j["lead_id"]))]
ids = ",".join(f"'{j['lead_id']}'" for j in featured)
traces = defaultdict(list)
if ids:
    tr = hogql(f"""
    SELECT toString(person_id) pid, toString(timestamp) ts, event AS ev,
           properties.$pathname AS path, properties.$session_id AS sid,
           round(toFloat(properties.$prev_pageview_max_scroll_percentage)*100) AS scroll
    FROM events
    WHERE person_id IN ({ids}) AND event IN ('$pageview','$pageleave','$rageclick')
    ORDER BY person_id, timestamp LIMIT 4000
    """)
    for pid, ts, ev, path, sid, scroll in tr:
        traces[pid].append({"ts": ts, "ev": ev.replace("$",""), "path": path,
                            "sid": sid, "scroll": int(scroll or 0)})
print(f"  {len(traces)} real timelines pulled")

# ============================ daily funnel timeseries (trend + anomaly) ============================
print("[3/6] daily funnel timeseries ...")
by_day = defaultdict(lambda: {"leads":0,"engaged":0,"consult":0,"converted":0})
for j in J:
    d = by_day[j["date"]]
    d["leads"] += 1
    if j["reached_proof"]: d["engaged"] += 1
    if j["reached_consult"]: d["consult"] += 1
    if j["converted"]: d["converted"] += 1
days = sorted(by_day)
timeseries = [{"date": d, **by_day[d], "cvr": round(by_day[d]["converted"]/by_day[d]["leads"],4) if by_day[d]["leads"] else 0} for d in days]

def window(metric, lo, hi):
    seg = timeseries[lo:hi]
    lead = sum(x["leads"] for x in seg); conv = sum(x["converted"] for x in seg)
    if metric=="cvr":       return conv/lead if lead else 0
    if metric=="leads":     return lead
    if metric=="converted": return conv
    if metric=="engaged_rate":
        eng = sum(x["engaged"] for x in seg); return eng/lead if lead else 0

def metric_card(key, label, fmt, metric, invert=False):
    recent = window(metric, -7, len(timeseries))
    prior  = window(metric, -21, -7)
    delta  = (recent-prior)/prior if prior else 0
    # anomaly: >20% adverse move vs trailing baseline
    adverse = (delta < 0) if not invert else (delta > 0)
    anomaly = abs(delta) >= 0.20 and adverse
    return {"key":key,"label":label,"fmt":fmt,"value":round(recent,4),"prev":round(prior,4),
            "delta":round(delta,3),"anomaly":anomaly,"good_up": not invert}

metrics = [
    metric_card("cvr","Conversion rate","pct","cvr"),
    metric_card("leads","Visitors / week","int","leads"),
    metric_card("converted","Conversions / wk","int","converted"),
    metric_card("engaged_rate","Past-hero rate","pct","engaged_rate"),
]

# funnel with leak detection (PRD S4.2) — scroll-nested stages so the funnel is monotonic.
# (The /book-free-consultation page isn't a reliable mid-step: these leads convert via
#  inline landing-page forms, so consultation-page reach is not on the critical path.)
stages = [
    {"name":"Ad click → landing",       "n": N},
    {"name":"Engaged (past hero ≥20%)", "n": sum(1 for j in J if j["reached_proof"])},
    {"name":"Read proof (≥45%)",        "n": sum(1 for j in J if j["reached_testimonials"])},
    {"name":"Qualified (booked)",       "n": len(CONV)},
]
for i,s in enumerate(stages):
    prev = stages[i-1]["n"] if i>0 else s["n"]
    s["drop"] = round(max(0.0, 1 - s["n"]/prev), 4) if prev else 0
    s["of_top"] = round(s["n"]/N, 4)
leak_i = max(range(1,len(stages)), key=lambda i: stages[i]["drop"])
stages[leak_i]["biggest_leak"] = True

# ============================ LAYER 3 — findings engine (generic cohort diff + lift) ============================
print("[4/6] findings + recommendations ...")
RULES = {
 "page_section":"Reorder / redesign the section — move proof + testimonials above the fold.",
 "search_term":"Add negative keywords for the low-intent query + reallocate its budget to the winner.",
 "creative_hook":"Pause the underperforming ad + generate a new variant on the winning angle.",
 "form_field":"Make the field optional / split the form into steps / defer it.",
 "audience":"Build a lookalike of the converting segment + shift budget toward it.",
 "device":"Ship a mobile-specific above-the-fold layout; move CTA + proof up on small screens.",
 "landing_page":"Re-point the ad group to the higher-converting landing page; retire the loser.",
}
def wilson_lo(k,n,z=1.96):
    if not n: return 0.0
    p=k/n; return max(0.0,(p+z*z/(2*n)-z*math.sqrt((p*(1-p)+z*z/(4*n))/n))/(1+z*z/n))

def finding(signal, cohort_a, cohort_b, name_a, name_b, entity, note="", min_n=25):
    a,b=list(cohort_a),list(cohort_b)
    if len(a)<min_n or len(b)<min_n: return None
    ra,rb=rate(a),rate(b)
    if rb<=0 or ra<=rb: return None
    ka=sum(x["converted"] for x in a); kb=sum(x["converted"] for x in b)
    lift=ra/rb; affected=len(b); inc=affected*(ra-rb)
    # confidence: sample size + effect size + (calibration placeholder)
    strong = (ka>=20 and kb>=20) and (wilson_lo(ka,len(a)) > rb)
    conf = "high" if strong else ("med" if (ka>=8 and kb>=8 and lift>=1.3) else "low")
    return {"signal":signal,"cohort_a":name_a,"cohort_b":name_b,"rate_a":round(ra,4),
            "rate_b":round(rb,4),"n_a":len(a),"n_b":len(b),"k_a":ka,"k_b":kb,"lift":round(lift,2),
            "affected_volume":affected,"incremental_leads":round(inc),
            "impact_inr":round(inc*VALUE_PER_LEAD),"confidence":conf,"entity":entity,
            "action_rule":RULES[entity],"note":note,
            "evidence_query":{"signal":signal}}

findings=[]
def add(f):
    if f: findings.append(f)
add(finding("reached_proof",[j for j in J if j["reached_proof"]],[j for j in J if not j["reached_proof"]],
    "scrolled past the hero (≥20%)","hero-only (<20%)","page_section",
    "Most paid traffic bounces at ~17-19% scroll — proof sits below the fold."))
add(finding("reached_testimonials",[j for j in J if j["reached_testimonials"]],[j for j in J if not j["reached_testimonials"]],
    "reached testimonials (≥45%)","never reached testimonials","page_section"))
add(finding("returning",[j for j in J if j["returning"]],[j for j in J if not j["returning"]],
    "returned (2+ visits)","single visit","audience"))
add(finding("no_rage",[j for j in J if not j["rage_clicked"]],[j for j in J if j["rage_clicked"]],
    "no rage clicks","rage-clicked (broken/dead UI)","page_section",
    "Rage clicks mark a dead tap-target on the landing page."))
# NB: reached_consult is deliberately NOT a ranked finding — opening the form is a
# near-outcome of converting, so its "lift" is circular. It stays a journey signal only.
# best/worst by dimension
def best_worst(key, entity, minn, note=""):
    grp=defaultdict(list)
    for j in J:
        if j[key]: grp[j[key]].append(j)
    rk=sorted([(k,rate(v),len(v)) for k,v in grp.items() if len(v)>=minn], key=lambda x:-x[1])
    if len(rk)>=2:
        bw=finding(key,grp[rk[0][0]],grp[rk[-1][0]],str(rk[0][0]),str(rk[-1][0]),entity,note,min_n=minn)
        if bw: bw["ranked"]=[{"key":str(k),"cvr":round(r,4),"n":n} for k,r,n in rk]
        add(bw)
best_worst("landing_page","landing_page",80)
best_worst("search_term","search_term",30,"Same budget, very different conversion rates by query.")
best_worst("campaign","audience",60)

findings.sort(key=lambda f:-f["incremental_leads"])
for i,f in enumerate(findings): f["rank"]=i+1

# ---- draft actions (PRD S8.1): concrete, editable artifact per entity ----
low_terms = sorted([(k,rate(v),len(v)) for k,v in
    (lambda g:[ (k,v) for k,v in g.items()])(
        (lambda:  (lambda d:[d[j["search_term"]].append(j) for j in J if j["search_term"]] and d or d)(defaultdict(list)))()
    )], key=lambda x:x[1])
# recompute low-intent search terms cleanly
tg=defaultdict(list)
for j in J:
    if j["search_term"]: tg[j["search_term"]].append(j)
term_rank=sorted([(k,rate(v),len(v)) for k,v in tg.items() if len(v)>=30], key=lambda x:x[1])
neg_terms=[t for t,r,n in term_rank[:4]]
scale_terms=[t for t,r,n in sorted(term_rank,key=lambda x:-x[1])[:3]]

def draft_for(f):
    e=f["entity"]
    if e=="page_section":
        return {"type":"Landing-page reorder spec","artifact":[
            "CURRENT order:  hero → proof → testimonials → pricing/FAQ → CTA",
            "NEW order:      hero (compressed) → proof → testimonials → CTA → pricing/FAQ",
            "• Cut hero height ~40%; surface 2 testimonials + trust badges above the fold.",
            "• Add a sticky 'Book free consultation' CTA on mobile.",
            f"• Expected: move {f['affected_volume']:,} hero-bouncers toward the {f['lift']}× cohort.",
        ],"apply_via":"Export to Progen LP repo (progen-landing-pages) as a diff PR."}
    if e=="search_term":
        return {"type":"Negative-keyword list + budget move","artifact":[
            "ADD as negative (exact) — low conversion-rate queries:",
            *[f"   – \"{t}\"  ({int(rate(tg[t])*100)}% CVR, {len(tg[t])} visitors)" for t in neg_terms],
            "REALLOCATE freed budget toward high-intent winners:",
            *[f"   + \"{t}\"  ({int(rate(tg[t])*100)}% CVR)" for t in scale_terms],
        ],"apply_via":"Google Ads API: campaignCriterion.create (negatives) + budget shift."}
    if e=="landing_page":
        rk=f.get("ranked",[])
        return {"type":"Ad-group re-point","artifact":[
            f"Winner: {rk[0]['key']}  ({int(rk[0]['cvr']*100)}% CVR)" if rk else "",
            f"Retire: {rk[-1]['key']}  ({int(rk[-1]['cvr']*100)}% CVR)" if rk else "",
            "• Point the loser's ad group at the winning template.",
            "• A/B 80/20 for one week before full cutover.",
        ],"apply_via":"Google Ads API: adGroupAd final URL update."}
    if e=="audience":
        return {"type":"Lookalike seed + budget shift","artifact":[
            "Seed segment (converting behavior):",
            "   returning (2+ visits) AND reached_testimonials AND intent_score ≥ 75",
            f"   ({sum(1 for j in J if j['returning'] and j['reached_testimonials'])} visitors match)",
            "• Build a lookalike; add a retargeting audience of past-hero non-converters.",
            "• Shift 15% budget from broad prospecting to this audience.",
        ],"apply_via":"Google Ads API: userList.create + campaign budget update."}
    if e=="form_field":
        return {"type":"Form friction fix","artifact":[
            "• Split the consultation form into 2 steps (contact → preference).",
            "• Make phone optional at step 1; defer to post-submit.",
            "• Add inline validation + a progress indicator.",
        ],"apply_via":"Export to Progen LP repo as a form-component diff."}
    return {"type":"Action draft","artifact":[f["action_rule"]],"apply_via":"Manual."}

TITLES={"reached_proof":"Compress the hero — get value prop + proof into the first screen",
 "reached_testimonials":"Move proof + testimonials above the fold",
 "returning":"Retarget returning visitors — they convert far higher",
 "no_rage":"Fix the rage-clicked element on the landing page",
 "reached_consult":"Reduce friction to open the consultation form",
 "landing_page":"Re-point ad spend to the winning landing page",
 "search_term":"Cut low-intent search terms, scale the winners",
 "campaign":"Reallocate budget to the winning campaign"}

recommendations=[]
for f in findings:
    gap=f["rate_a"]-f["rate_b"]
    because=(f'{f["cohort_a"]} convert {f["lift"]}× those who {f["cohort_b"]} '
             f'({f["rate_a"]*100:.1f}% vs {f["rate_b"]*100:.1f}%). '
             f'{f["affected_volume"]:,} visitors sit on the losing side.' + (" "+f["note"] if f["note"] else ""))
    recommendations.append({
        "id":f"rec-{f['rank']}","rank":f["rank"],"title":TITLES.get(f["signal"],f["signal"]),
        "entity":f["entity"],"stage":{"page_section":"Landing page","search_term":"Targeting",
            "landing_page":"Landing page","audience":"Targeting","form_field":"Form",
            "device":"Landing page","creative_hook":"Creative"}.get(f["entity"],"Journey"),
        "because":because,"do":f["action_rule"],"confidence":f["confidence"],
        "incremental_leads":f["incremental_leads"],"impact_inr":f["impact_inr"],
        "cvr_gap":round(gap,4),"finding":f,"draft":draft_for(f),"status":"open"})

# ============================ converter diff per landing page (Epic 5) ============================
print("[5/6] converter diff + campaign intel ...")
def section_reach(sub):
    n=len(sub) or 1
    return {name: round(sum(1 for j in sub if j["max_scroll_pct"]>=off)/n,3) for name,off in SECTION_MAP}

pg=defaultdict(list)
for j in J: pg[j["landing_page"]].append(j)
converter_diff=[]
for page,rowsp in sorted(pg.items(), key=lambda kv:-len(kv[1])):
    if len(rowsp)<80: continue
    cA=[j for j in rowsp if j["converted"]]; cB=[j for j in rowsp if not j["converted"]]
    if len(cA)<8: continue
    # top differentiating signals by lift within the page
    sigs=[]
    for sg,af,bf,lab in [("reached_proof",lambda j:j["reached_proof"],None,"reaches proof"),
                         ("reached_testimonials",lambda j:j["reached_testimonials"],None,"reaches testimonials"),
                         ("returning",lambda j:j["returning"],None,"returns (2+ visits)"),
                         ("desktop",lambda j:j["device"]=="Desktop",None,"on desktop"),
                         ("no_rage",lambda j:not j["rage_clicked"],None,"no rage clicks")]:
        A=[j for j in rowsp if af(j)]; B=[j for j in rowsp if not af(j)]
        if len(A)>=15 and len(B)>=15 and rate(B)>0 and rate(A)>rate(B):
            sigs.append({"signal":lab,"lift":round(rate(A)/rate(B),2),"cvr_a":round(rate(A),4),"cvr_b":round(rate(B),4)})
    sigs.sort(key=lambda s:-s["lift"])
    # dimension breakdown
    dev=defaultdict(list)
    for j in rowsp: dev[j["device"]].append(j)
    converter_diff.append({"page":page,"n":len(rowsp),"converters":len(cA),"cvr":round(rate(rowsp),4),
        "sections_converters":section_reach(cA),"sections_nonconverters":section_reach(cB),
        "top_signals":sigs[:4],
        "by_device":[{"key":k,"n":len(v),"cvr":round(rate(v),4)} for k,v in sorted(dev.items(),key=lambda kv:-len(kv[1]))]})

# campaign / keyword intelligence (Epic 7)
def intel(key):
    g=defaultdict(list)
    for j in J:
        if j[key]: g[j[key]].append(j)
    out=[]
    med=sorted([rate(v) for v in g.values() if len(v)>=30])
    med=med[len(med)//2] if med else 0
    for k,v in g.items():
        if len(v)<30: continue
        r=rate(v)
        out.append({"key":str(k),"leads":len(v),"qualified":sum(x["converted"] for x in v),
            "qualified_rate":round(r,4),"avg_scroll":round(sum(x["max_scroll_pct"] for x in v)/len(v)),
            "wasted_spend_flag": (r < med*0.6 and len(v)>=80),
            "scale_flag": (r > med*1.4)})
    return sorted(out, key=lambda x:-x["leads"])
campaign_intel=intel("campaign"); keyword_intel=intel("search_term")

# ============================ evidence (recordings) ============================
evidence=[]
try:
    for r in rest("/session_recordings/?limit=60").get("results",[]):
        url=r.get("start_url") or ""
        if not any(k in url for k in ("weight","keto")): continue
        low=url.lower()
        camp=None
        if "utm_campaign=" in low: camp=low.split("utm_campaign=")[1].split("&")[0]
        evidence.append({"id":r["id"],"url":f"{REPLAY}/{r['id']}","start_url":url.split("?")[0][:90],
            "path":"/"+url.split("?")[0].split("/",3)[-1] if url.count("/")>=3 else url,
            "duration_s":r.get("recording_duration") or 0,"active_s":r.get("active_seconds"),
            "clicks":r.get("click_count"),"campaign":camp,"start_time":r.get("start_time")})
except Exception as e:
    print("  recordings unavailable:", e)

# ============================ signal taxonomy registry (versioned) ============================
signal_definitions=[
 {"name":"max_scroll_pct","entity":"session_event","type":"int 0-100","v":"1.0","rule":"max($prev_pageview_max_scroll_percentage) over landing pageleaves","evidence":"replay_url"},
 {"name":"sections_seen","entity":"session_event","type":"set","v":"1.0","rule":"scroll vs section_map offsets","evidence":"replay_url"},
 {"name":"reached_testimonials","entity":"session_event","type":"bool","v":"1.0","rule":"max_scroll_pct ≥ 45","evidence":"replay_url"},
 {"name":"reached_proof","entity":"session_event","type":"bool","v":"1.0","rule":"max_scroll_pct ≥ 20","evidence":"replay_url"},
 {"name":"rage_clicked","entity":"session_event","type":"bool","v":"1.0","rule":"any $rageclick in journey","evidence":"replay_url"},
 {"name":"intent_score","entity":"journey","type":"int 0-100","v":"1.0","rule":"scroll + returning + form-open composite","evidence":"journey"},
 {"name":"engagement_archetype","entity":"journey","type":"enum","v":"1.0","rule":"visits/scroll/pageviews (outcome-independent)","evidence":"journey"},
 {"name":"friction_score","entity":"journey","type":"int 0-100","v":"1.0","rule":"rage + shallow-scroll + instant-bounce","evidence":"journey"},
 {"name":"returning","entity":"journey","type":"bool","v":"1.0","rule":"visit_count ≥ 2","evidence":"journey"},
 {"name":"converted","entity":"journey","type":"bool (label)","v":"1.0","rule":"reached /thank-you/","evidence":"journey"},
 {"name":"qualified_rate","entity":"campaign","type":"float","v":"1.0","rule":"conversions / visitors per campaign","evidence":"journey[]"},
 {"name":"wasted_spend_flag","entity":"campaign","type":"bool","v":"1.0","rule":"qualified_rate < 0.6× median AND volume ≥ 80","evidence":"journey[]"},
 {"name":"search_term_intent","entity":"campaign","type":"enum","v":"1.0","rule":"qualified_rate percentile of term","evidence":"journey[]"},
 {"name":"cost_per_qualified","entity":"campaign","type":"float","v":"0.0 (unconnected)","rule":"spend / qualified — NEEDS ad-spend connection","evidence":"—"},
 {"name":"hook_type / format / message_theme","entity":"creative","type":"enum","v":"0.0 (unconnected)","rule":"from creative metadata — NEEDS ad-platform creative feed","evidence":"—"},
]

# ============================ assemble ============================
substrate={
 "meta":{"client":"Progen Weight Management","source":"PostHog","region":REGION,"project_id":PROJECT,
   "funnel":"Google Ads → weight-loss landing pages → book consultation → thank-you",
   "value_per_lead":VALUE_PER_LEAD,"currency":CURRENCY,"north_star_default":"cvr",
   "generated_at":datetime.now().astimezone().isoformat(timespec="seconds"),
   "window_days":WINDOW_DAYS,
   "date_range":[days[0],days[-1]] if days else [],"taxonomy_version":"1.0",
   "generated_from":"live PostHog query API (HogQL)",
   "workspaces":[{"id":"progen","name":"Progen Weight Management","role":"agency-admin"},
                 {"id":"acme","name":"Acme Aesthetics (demo)","role":"marketer","locked":True}],
   "north_stars":[{"key":"cvr","label":"Conversion rate","desc":"rank by incremental conversions"},
                  {"key":"leads","label":"Incremental conversions (₹ value)","desc":"rank by ₹ = conversions × value/conversion"},
                  {"key":"cpl","label":"Cost per conversion","desc":"proxy: conversion volume (spend not connected)"}],
   "assumptions":[
     "Conversion = reaching /thank-you/ (post-consultation booking).",
     "Section map inferred from scroll depth: hero 0-20, proof 20-45, testimonials 45-70, pricing/FAQ 70-90, CTA 90+.",
     f"Value per conversion assumed {CURRENCY} {VALUE_PER_LEAD:,} (editable; only affects the ₹ north-star).",
     "Ad-spend / cost-per-conversion NOT connected — CPL ranks on conversion volume; creative-asset signals shown as schema-ready, not fabricated.",
     "Multi-tenant + roles + apply-actions are scaffolded (human-in-the-loop); a second workspace is shown locked as a demo of isolation.",
   ]},
 "funnel_summary":{"leads":N,"converted":len(CONV),"cvr":round(len(CONV)/N,4),
   "avg_scroll":round(sum(j["max_scroll_pct"] for j in J)/N),
   "mobile_share":round(sum(1 for j in J if j["device"]=="Mobile")/N,3),
   "rage_rate":round(sum(1 for j in J if j["rage_clicked"])/N,3),
   "value_at_stake":sum(r["impact_inr"] for r in recommendations),
   "incremental_leads_at_stake":sum(r["incremental_leads"] for r in recommendations)},
 "metrics":metrics,"timeseries":timeseries,"funnel_stages":stages,
 "recommendations":recommendations,"findings":findings,
 "converter_diff":converter_diff,"campaign_intel":campaign_intel,"keyword_intel":keyword_intel,
 "signal_definitions":signal_definitions,"evidence":evidence,
 "section_map":[{"name":n,"offset":o} for n,o in SECTION_MAP],
 "journeys":[{k:j[k] for k in ("lead_id","date","landing_page","device","campaign","search_term",
    "referrer","first_session","max_scroll_pct","sections_seen","visit_count","pageviews",
    "rage_clicked","reached_consult","reached_testimonials","returning","intent_score",
    "friction_score","quality_tier","engagement_archetype","converted")} for j in J],
 "timelines":{pid:traces[pid] for pid in traces},
}
out=os.path.join(os.path.dirname(__file__),"..","web","public","substrate.json")
os.makedirs(os.path.dirname(out),exist_ok=True)
json.dump(substrate, open(out,"w"), separators=(",",":"), default=str)
print(f"[6/6] wrote {out}  ({os.path.getsize(out)//1024} KB)")
print(f"  {len(recommendations)} recs · {len(converter_diff)} pages diffed · "
      f"{len(campaign_intel)} campaigns · {len(keyword_intel)} keywords · {len(traces)} timelines")
