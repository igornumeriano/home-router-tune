---
name: home-router-tune
description: Audit and safely tune a home ISP modem/router across four gated phases — discover the LAN and Wi-Fi neighborhood, map every admin-panel setting, draft a prioritized improvement plan, execute only what the user approves, then write a per-run report plus an append-only history. Reads admin credentials from a local .env (never asked interactively), drives the admin panel via the dev-browser skill, and ships tested vendor playbooks for Sagemcom, Huawei, ZTE, Nokia, Intelbras, and Technicolor gateways used by Claro, Vivo, Oi, and TIM in Brazil; generalizes to any other consumer ISP gateway. Trigger broadly on anything involving the user's home modem, router, Wi-Fi, or ISP-supplied gateway — auditing settings, hardening security (WPS, remote management, default password, firewall, telemetry), troubleshooting flaky or slow Wi-Fi, devices that keep dropping (cameras, smart bulbs, IoT), weak signal in part of the house, neighbor channel interference, post-ISP-swap reviews, or simply logging into 192.168.0.1 / 192.168.1.1 / 192.168.100.1 to change something. Loose phrasings count — "my Wi-Fi is flaky", "the ISP just swapped my modem", "make my home network faster", "minha internet tá ruim", "trocaram meu roteador", "ajustar Wi-Fi", "câmera fica caindo" — and so do casual queries that never use the words "router" or "modem" but describe the symptoms. Skip when the request is app-level networking (Express/Next.js routers, React Router), OS-level laptop network config, cloud VPC/Terraform, nmap/DNS scripting, or a genuine link-layer fault that needs an ISP truck roll rather than a config change.
compatibility:
  required:
    - dev-browser
  optional:
    - speedtest-cli
    - nmap
    - mtr
    - jq
---

# Home Router Tune

A 4-phase workflow that audits and tunes a residential ISP-supplied modem/router. Each phase produces a written artifact under `./router-tune/`. Execution of changes is **always gated by explicit user approval** — Phase 3 never runs automatically.

```
[Phase 1] Discovery   →  discovery-<ts>.md
[Phase 2] Plan        →  plan-<ts>.md            ⟵ user reviews here
[Phase 3] Execute     →  exec-<ts>.log           ⟵ only on user "go"
[Phase 4] Report      →  report-<ts>.md
                      →  history.md              ⟵ cumulative, append-only
```

## When to use

- User asks to "audit", "tune", "optimize", "harden", or "look at" the router/modem/Wi-Fi.
- After an ISP technician swaps the modem (factory defaults are usually suboptimal).
- User reports flaky Wi-Fi and you've already ruled out coax/DOCSIS link-layer issues.

Don't use for: actual link-layer issues (low SNR, persistent packet loss). Those need an ISP truck roll, not a config change.

## Setup: the `.env` file

Credentials are **read from disk**, never asked interactively, never written to memory or transcripts.

Look for `.env` in this priority order:
1. `./router-tune/.env` (project-scoped — preferred)
2. `./.env` (current working dir)
3. `~/.config/home-router-tune/.env` (global fallback)

Required keys:

```env
ROUTER_HOST=192.168.0.1
ROUTER_USER=admin
ROUTER_PASS=replace-me

# optional
ROUTER_VENDOR=sagemcom-fast-3895   # see references/vendors/; auto-detected if unset
ROUTER_LOGIN_PATH=/                 # auto-detected if unset
ROUTER_HTTPS=true                   # default true

# behavioural toggles
DRY_RUN=false                       # if true, Phase 3 prints actions but does not click Apply
AUTO_APPROVE=false                  # if true AND a prior identical plan was approved, skip the gate
SPEEDTEST=true                      # run speedtest before & after if installed
NOTIFY_WEBHOOK=                     # optional: POST report summary to this URL on completion

# vendor extras (only when needed)
ROUTER_BACKUP_PATH=                 # path to firmware's config-XML backup endpoint
```

If no `.env` is found:
1. Create `./router-tune/` if missing.
2. Copy the bundled templates — `cp <skill-dir>/assets/.env.example ./router-tune/.env.example` and `cp <skill-dir>/assets/.gitignore ./router-tune/.gitignore`. The `.env.example` template documents every key inline with comments and common defaults (HOST candidates, vendor hints, behavioural toggles); the `.gitignore` keeps secrets, screenshots, and binary backups out of the repo while still letting plans / reports / `history.md` be committed.
3. Tell the user: "I need credentials in `./router-tune/.env` — copied a template to `.env.example`. Fill it in and rerun."
4. **Stop.** Don't proceed without credentials.

When loading: read with `cat`, never log the password back to the user, never include it in any artifact written under `./router-tune/`.

## Output directory

All artifacts go in `./router-tune/` in the current working directory:

```
router-tune/
├── .env                    (gitignore'd, user-provided)
├── .env.example            (template, safe to commit)
├── .gitignore              (auto-created with ".env" + "screenshots/" + "backups/" + ".lock")
├── .lock                   (transient; prevents concurrent runs)
├── discovery-<ts>.md       (Phase 1 human-readable, one per run)
├── discovery-<ts>.json     (Phase 1 machine-readable, for trend analysis)
├── plan-<ts>.md            (Phase 2 human-readable, one per run)
├── plan-<ts>.json          (Phase 2 machine-readable list of actions)
├── exec-<ts>.log           (Phase 3 stdout/stderr, one per run)
├── report-<ts>.md          (Phase 4 human-readable, one per run)
├── metrics-<ts>.json       (Phase 4 numbers: speedtest, latency, DOCSIS health)
├── history.md              (cumulative, append-only)
├── oui-cache.json          (MAC OUI vendor lookups, accumulated)
├── backups/                (admin XML config backups, one per run)
│   └── config-<ts>.xml
└── screenshots/            (dev-browser saves; one subdir per phase)
    ├── phase1-<ts>/
    └── phase3-<ts>/
```

`<ts>` = `YYYYMMDD-HHMMSS` local time. The `.json` siblings exist so future runs can do trend analysis (e.g. "DOCSIS SNR dropped 3 dB over the last 5 runs"). Both are kept; `.md` for humans, `.json` for the agent.

JSON shapes for `discovery`, `plan`, `metrics` and the optional webhook payload live in `references/output-schemas.md`.

## Phase 1 — Discovery (read-only)

**Goal:** map current state from multiple angles, produce `discovery-<ts>.md` + `discovery-<ts>.json`. **No changes applied.**

### 1.0 Pre-flight

- Acquire `./router-tune/.lock` (write PID + ts). If a fresh lock (<10 min) exists, abort with "another run in progress".
- Read `./router-tune/history.md` if present — it captures user preferences and prior decisions ("user previously declined band steering").
- Read the most recent `discovery-*.json` if present — used later for **drift detection**.

### 1a. Local network scan

```bash
# Devices currently on the LAN
arp -a -n 2>/dev/null
# or, if available:
nmap -sn "$(echo $ROUTER_HOST | sed 's/\.[0-9]*$/.0\/24/')" 2>/dev/null

# Self info
ifconfig | grep -E "inet |ether " | head -20
```

### 1b. Neighborhood Wi-Fi scan

The most reliable scan is **inside the modem admin** (does both bands from the AP's vantage point). Many vendors expose a "Site Survey" / "Scan" button. Use `dev-browser` to click it and parse the resulting table.

On macOS as a cross-check (may be deprecated in recent versions):

```bash
/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s 2>/dev/null
# Newer macOS:
wdutil info 2>/dev/null
```

### 1c. Modem admin map (via dev-browser)

Login, then visit every settings page and snapshot every config. **Don't change anything in this phase** — only read. Vendor URL maps and selectors live in `references/vendors/<vendor>.md`.

Pages to walk on every vendor:

- Status: software/firmware version, DOCSIS sync (SNR, power, errors), WAN IP/MAC
- Wi-Fi radio (both bands): channel, width, mode, beamforming, MU-MIMO, power
- Wi-Fi main network (both bands): SSID, security mode, AP isolation, WPS
- Wi-Fi guest/IoT network: enabled state, SSID
- Wi-Fi mesh topology
- LAN/DHCP: range, lease time, reservations
- WAN: connection type, bridge state
- DNS v4/v6
- Advanced: UPnP, multicast, IPSec/PPTP pass-through, remote management
- Port forwarding / triggers / DMZ
- Firewall: level, granular rules
- Connected devices: per-band list with IP/MAC/signal/speed

Save screenshots of key pages to `./router-tune/screenshots/phase1-<ts>/`.

### 1d. Performance baseline (optional, on by default)

If `SPEEDTEST=true` and the binary is available, capture a network baseline:

```bash
# Throughput
speedtest-cli --simple 2>/dev/null \
  || /usr/local/bin/speedtest --format=json 2>/dev/null

# Latency to common targets (3 packets each, fast)
ping -c 3 -W 1 1.1.1.1 8.8.8.8 ${ROUTER_HOST} 2>/dev/null

# Path quality (one shot, 5 hops)
mtr -c 5 -r 1.1.1.1 2>/dev/null
```

Capture into `metrics-<ts>.json` so Phase 4 can compute "before/after" deltas. If the binaries aren't installed, skip silently — don't block.

### 1e. Admin XML config backup

If the firmware exposes a backup endpoint, download it to `./router-tune/backups/config-<ts>.xml`. This is the **disaster-recovery anchor** — if a future change goes wrong, the user can restore it via the same UI.

Backup XMLs sometimes contain fields the UI hides; never auto-edit/restore, but do parse them read-only in Phase 1 to surface anything interesting (remote-management URLs, hidden TR-069 ACS endpoint, telemetry flags).

### 1f. Drift detection vs prior run

If a previous `discovery-*.json` exists, diff it against the current one. Surface every field that changed without the user/skill acting on it:

- Channel changed (likely auto-channel re-decided OR ISP TR-069 push)
- Lease reverted to default (likely TR-069)
- Firmware version changed (silent OTA from ISP)
- New device with locally-administered MAC prefix (potential rogue or randomized client)
- DOCSIS error count growth rate (linear / accelerating)

Drift findings go in their own section of `discovery-<ts>.md` and as `anomalies` in `discovery-<ts>.json`.

### 1g. Discovery output

Write `./router-tune/discovery-<ts>.md` covering:

```markdown
# Discovery — <ts>

## Hardware
- Vendor / model / firmware
- DOCSIS sync health (SNR, power, errors)
- WAN IP, uptime

## Wi-Fi (both bands)
- Channel (and backend-confirmed value if firmware exposes it)
- Width, mode, beamforming, MU-MIMO, AP isolation, WPS
- Neighborhood scan results

## LAN / DHCP
- Range, lease, reservations (or "not exposed by UI")

## Security & Advanced
- Firewall level, UPnP, remote mgmt, port forwards, DMZ

## Connected devices
- Table: IP / MAC / band / signal / speed / hostname / vendor (from OUI)

## Local LAN scan
- arp -a output excerpt

## Anomalies
- Anything that looks off (devices missing that should be there,
  DFS channels in dense urban, lease too short, WPS on, etc.)
```

## Phase 2 — Plan (proposed changes, no execution)

**Goal:** convert discovery into a prioritized improvement plan. Output `plan-<ts>.md` + `plan-<ts>.json`. **Wait for user approval before Phase 3.**

For each candidate change, classify by:

- **Category**: `wifi-radio` / `wifi-security` / `dhcp` / `firewall` / `advanced` / `housekeeping`
- **Severity**: `high` (causes real instability) / `medium` (measurable improvement) / `low` (hygiene)
- **Risk**: `none` (no downtime) / `brief` (radio reset, ~30 s) / `disruptive` (full reboot)
- **Reversibility**: `trivial` / `manual` (need to remember old value) / `hard`
- **Justification** with cited evidence from Phase 1 discovery

Standard candidates to evaluate every run (skip if Phase 1 shows already optimal):

| Candidate | Trigger condition | Severity | Risk |
|---|---|---|---|
| Fix 5 GHz to non-DFS (149/153/157/161) | Current channel ∈ 52–144 OR Auto | high | brief |
| Fix 2.4 GHz channel based on neighbor scan | Auto, OR overlapping with strong (-60+ dBm) neighbor | medium | brief |
| Set 2.4 GHz width to 20 MHz | Currently 40 MHz in dense env | medium | brief |
| Bump DHCP lease | Lease < 86400 s | low | none |
| Disable WPS | WPS enabled | medium | none |
| Confirm AP isolation off | Currently on (rare) | high | none |
| Lower firewall to baseline | Currently Medium/High and breaking NAT traversal | medium | none |
| Disable Remote Management | Currently on | high | none |
| Disable band steering / unified SSID | On + has IoT clients | medium | brief |
| Identify missing DHCP reservation | UI lacks the feature | low | n/a (advise static IP in client) |

Also surface non-actionable findings: "DOCSIS errors total = X (high)" → recommend ISP ticket; "device offline that should be online" → recommend power cycle.

### Plan output

```markdown
# Plan — <ts>

## Summary
- N changes proposed (X high, Y medium, Z low)
- Estimated total downtime: ~M minutes (only Wi-Fi briefly)

## Proposed changes (in execution order)

### 1. <Title>
- **Category**: wifi-radio
- **Severity**: high
- **Risk**: brief (5 GHz radio resets ~30 s)
- **Reversibility**: trivial (one click back to Auto)
- **Why**: Phase 1 showed channel=132 (DFS). DFS forces 30-min vacate on radar detection.
- **Action**: Wi-Fi → Radio → 5 GHz tab → "Control channel" → 149 → Apply
- **Expected after**: backend-confirmed value = 149

### 2. ...

## Non-actionable findings
- ...

## Out of scope (declined or risky)
- ...
```

After writing the plan, **ask the user**:
> "Plan saved at `./router-tune/plan-<ts>.md`. Review and tell me which changes to apply (e.g., 'all', '1,3,5', or 'skip 4'). I won't execute anything until you confirm."

**Do not proceed to Phase 3 without explicit approval.**

The `plan-<ts>.json` companion (schema in `references/output-schemas.md`) lets Phase 3 replay the approved set deterministically and lets future runs detect "we did this before — did it stick?".

## Phase 3 — Execute (gated)

**Goal:** apply approved changes, verify each one, log everything to `exec-<ts>.log`. Run only when the user gives an explicit go.

If `DRY_RUN=true`: walk the plan, print every action to stdout, but **do not click Apply**. Useful as a rehearsal step the user can paste into chat for review.

If `AUTO_APPROVE=true` and `plan-<ts>.json` matches an action set the user has approved before (same `id` + `after` value, found in `history.md`), skip the gate. This is for unattended scheduled runs — rare but useful for "fix DFS drift" cron jobs.

For each approved change:

1. Snapshot the current value of the target field (for rollback).
2. Apply the change via `dev-browser`.
3. Wait for the radio/service to settle (`waitForTimeout` 5–8 s after Wi-Fi changes).
4. Reload the page, parse the backend-confirmed value (most firmware exposes a "current value" indicator separate from the form input).
5. Compare to the expected value:
   - **Match** → log success, continue.
   - **Mismatch** → log failure, **stop the run**, report which change failed and what the current value is.
6. After every 3 changes or when the modem session times out, re-login.

Disruption rules (most consumer firmware needs this; check the vendor playbook for exact numbers):
- Pause ≥ 8 s between consecutive Apply clicks. Spamming locks the webserver.
- If the page renders blank for >30 s, the webserver is recycling — wait, then create a fresh anonymous page (don't reuse the named one, it stays poisoned).
- After 4+ rapid changes, the entire admin may go blank for ~1 min. Pause and re-attempt with a fresh page.

### Execution log format

```
[14:32:11] Login OK (session via cookie)
[14:32:14] Change #1: 5 GHz channel Auto/132 → 149
[14:32:14]   Snapshot before: dropdown=Auto, current=132
[14:32:15]   Click <selector> → option "149"
[14:32:15]   Click "Apply"
[14:32:23]   Reload, parse current=149 ✓ MATCH
[14:32:31] Change #2: ...
```

## Phase 4 — Report + History

**Goal:** consolidate the run into a user-facing report and append to the cumulative history.

### `report-<ts>.md` (per-run)

```markdown
# Tune report — <ts>

## What changed (before → after)
| Setting | Before | After |
|---|---|---|
| 5 GHz channel | Auto/132 | 149 |
| ... | ... | ... |

## What did not change (skipped or already optimal)
- ...

## Failed changes (if any)
- ...

## Connected devices snapshot (after)
- ...

## Performance delta (if SPEEDTEST=true)
- Down: 480 → 487 Mbps
- Up: 38 → 39 Mbps
- Ping to 1.1.1.1: 9 → 8 ms

## Outstanding follow-ups for the user
- "Camera X still offline → power cycle" (not the modem's fault)
- "DOCSIS errors growing → open ticket if persists"

## Rollback recipe
- For each change applied, the exact UI path + previous value, so the user can revert manually if needed.
```

### `history.md` (append-only)

After every run, append a one-block summary:

```markdown
## <ts> — <vendor model> @ <host>
- Changes applied: 5 (high: 2, medium: 2, low: 1)
- Notable: 5 GHz moved off DFS (132 → 149); 2.4 GHz fixed to 6 (was 1, strong neighbor at -52 dBm)
- Failures: none
- Skipped: enable band steering (declined by user)
- Run artifacts: discovery-<ts>.md / plan-<ts>.md / report-<ts>.md
```

This file is the long-term memory of the network's tuning. On future runs, **read it at the start of Phase 1** to understand prior decisions ("user previously declined band steering — don't propose again unless context changed").

## Vendor playbooks

The 4-phase workflow is vendor-agnostic. Vendor-specific URL maps, control names, UI strings (Apply / Site Survey labels), and known firmware quirks live in `references/vendors/`. Set `ROUTER_VENDOR` to load a playbook explicitly, or auto-detect from the login page.

Currently shipped:

| Playbook id | Common ISPs in Brazil | Notes |
|---|---|---|
| `sagemcom-fast-3895` | Claro Net | DOCSIS; pt-BR Angular UI with `ng-select`; webserver throttling; stubborn DFS auto-channel |
| `huawei-hg8245-eg8145` | Vivo Fibra, Oi Fibra | GPON; dual-credential (`user` vs `telecomadmin`); CSRF tokens |
| `zte-f670l` | Vivo Fibra, TIM Live | GPON; triple-credential (`user`/`useradmin`/`superadmin`); aggressive 3-min session timeout |
| `nokia-g140w` | Vivo Fibra | GPON; iframe-based, two-step save; very stable across runs |
| `intelbras-wifiber` | regional ISPs, retail | Mix of React SPA (Wi-Fiber AX) and jQuery (legacy); pt-BR labels |
| `technicolor` | Vivo, historical Claro/NET | Heterogeneous per build; legacy GAIA iframe UI on TG789/TG799 |

Each playbook follows the same structure: Connection / UI specifics / Pages map / Known firmware quirks / Apply-and-verify pattern. Read the relevant file before driving Phase 1c so you skip vendor-specific footguns.

For unknown firmware, in Phase 1:

1. Login form: usually inputs named `username`/`password` or `login`/`pass`.
2. Wi-Fi config menus: `Wireless` / `Wi-Fi` / `WLAN` / `Rede sem fio`.
3. Dropdowns may be native `<select>`, `ng-select`, custom React, or jQuery widgets — inspect first.
4. Scan label: "Site Survey" / "Scan" / "Varredura" / "Network Scan".
5. Apply label: "Apply" / "Save" / "Aplicar" / "OK" / checkmark icon.
6. Some firmware (Technicolor, Huawei) uses iframes — descend with `page.frameLocator`.
7. Verify by reloading and parsing the displayed value, not the form value.

When you confirm a new vendor works end-to-end, add a playbook in `references/vendors/<vendor>.md` so future runs are faster.

## Anti-recommendations

Things the user might suggest that you should push back on:

- **Don't hide the SSID.** Provides no real security (SSID still leaks in association frames + probe responses); breaks IoT pairing. Strong password > hidden name.
- **Don't enable band steering / unified SSID** if there are IoT or 2.4 GHz-only devices — many implementations stick clients on the wrong band.
- **Don't put the modem in bridge mode** unless the user explicitly wants a custom router behind it. Bridge + own router gives more control but breaks ISP support boundaries.
- **Don't set firewall to High/Medium.** Kills NAT traversal for cameras, voice/video, gaming.
- **Don't bother with custom firmware.** ISP-supplied modems almost never have OpenWrt support; brick risk is high.

## Settings to leave alone (already optimal at default)

- Beamforming TX/RX, MU-MIMO, max power, AP isolation off
- Firewall IPv4: baseline
- UPnP on, multicast on
- WPA2-Personal (don't switch to WPA3 if any IoT client predates ~2020)
- Region: matches the country
- Remote management: off

## Device classification (MAC OUI)

When listing connected devices, translate MAC OUIs into vendor labels for readability. See `references/oui-hints.md` for cache strategy and the Apple MAC-randomization caveat (randomized addresses cannot be tracked across SSID changes).

## Notifications (optional)

If `NOTIFY_WEBHOOK` is set in `.env`, POST a one-line JSON summary at end of run (schema in `references/output-schemas.md`). Useful for Slack incoming webhooks, Telegram bots, ntfy.sh topics, Pushover, or Home Assistant automations. Never include credentials in the payload.

## Bundled scripts

- `scripts/doctor.sh` — POSIX dependency probe. Run at the very start of every Phase 1 to get a parseable status table; exits 0 even when optional tools are missing. The lines are tab-separated `<name> <status> <detail>` so you can `awk` over them.
- `scripts/login-snippets.js` — reference snippets for `dev-browser`: generic login, page snapshot (screenshot + structured form-field dump), `<select>` and `ng-select` pickers, "current value" parser, apply-and-verify with reload, and blank-page recovery. Don't import — paste the relevant function into the dev-browser context and call it.

## Dependencies (probe at start)

Best-effort probe at the beginning of every run; degrade gracefully when missing. Tell the user once which optional features are off:

| Tool | Used for | Required? |
|---|---|---|
| `dev-browser` | Admin panel automation | **yes** (skill is useless without it) |
| `arp` (POSIX) | LAN device list | **yes** (built-in) |
| `nmap` | Better LAN sweep | optional |
| `speedtest-cli` or Ookla `speedtest` | Throughput baseline | optional |
| `ping`, `mtr` | Latency / path baseline | optional |
| `curl` | API probes / OUI lookup | optional |
| `jq` | Pretty-print JSON in logs | optional |

## Pitfalls

- **Connected via Wi-Fi during apply**: the user's session drops. Warn them upfront; suggest wired admin if available.
- **TR-069 reverts**: ISP may push old config back via remote management. If the user reports "changes magically reverted", that's why. Real mitigation requires bridge + own router (out of scope).
- **IoT cameras still offline after tune**: not the modem's fault. They cache BSSID and may need a power cycle to re-scan. Flag in report; don't keep tuning.
- **Backup XML editing as a "secret unlock"**: tempting but high brick risk; out of scope by default.

## Future enhancements (roadmap)

Not yet implemented. Pick one and bring it in when the user asks for a "v2" of the skill, or when the trigger naturally fits the current task:

1. **Wi-Fi RSSI heatmap**: track each connected device's RSSI across runs, alert on degradation > 10 dBm.
2. **DNS perf benchmark**: time queries to ISP DNS vs Cloudflare/Google/Quad9, suggest swap if measurably slower.
3. **IPv6 hygiene**: confirm SLAAC works, prefix delegation healthy, no DNS leaks.
4. **Mesh / extender topology**: walk multi-AP setups, recommend per-node channel plan.
5. **Telemetry / cloud feature audit**: list ISP-side cloud features and flag privacy-relevant ones.
6. **Per-VLAN/IoT segregation plan**: if firmware supports VLANs/multiple SSIDs, propose a plan that isolates IoT from main LAN.
7. **Coax signal regression alert**: store DOCSIS SNR/power per run, alert if any channel drops > 3 dB or upstream rises > 5 dBmV.
8. **WPA3 transition mode**: when firmware supports WPA2/WPA3 mixed, propose enabling — only after confirming all clients ≥ 2020.
9. **Default password audit**: detect if admin password matches a known factory pattern; warn loudly.
10. **Schedule integration**: offer to register a recurring monthly run via the `schedule` skill; useful for catching TR-069 drift.
11. **PR-style diff output**: render before/after as a side-by-side markdown diff that's easy to skim in chat.

## Standard execution flow (TL;DR for the agent)

1. Locate `.env` (priority order). If missing, write `.env.example` and stop.
2. Read `./router-tune/history.md` if present (prior decisions).
3. **Phase 1**: discover → write `discovery-<ts>.md` + screenshots. Show key findings.
4. **Phase 2**: plan → write `plan-<ts>.md`. Ask user which items to apply.
5. **Phase 3** (only after explicit approval): execute → log to `exec-<ts>.log`. Stop on first failure.
6. **Phase 4**: report → write `report-<ts>.md` + append to `history.md`. Summarize for user.
