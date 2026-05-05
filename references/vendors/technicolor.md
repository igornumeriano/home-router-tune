# Vendor playbook: Technicolor (DGA / MediaAccess Gateway)

Common at Vivo Fibra (and historically Claro/NET) in Brazil. The
"MediaAccess Gateway" line covers DOCSIS, GPON, and DSL variants under
nearly identical UIs. Variants seen: DGA0122, DGA4231, MediaAccess TG789,
MediaAccess TG799, MediaAccess CGA4233.

> Technicolor's UI is among the *most heterogeneous* in this list — even
> two devices from the same ISP can ship completely different builds.
> Treat the URL map below as a starting point and verify on first run.

## Connection

- **Default IP**: `192.168.1.1` (most common); `192.168.0.1` on a few
  shipments; `dsldevice.lan` if mDNS is available.
- **Login URL**: `http://<ROUTER_HOST>/` — Technicolor is HTTP-only on
  most builds; HTTPS, when present, uses a self-signed cert.
- **Default user**: `admin` (factory) or as printed on the bottom label.
  Some Vivo deployments use `vivo`.
- **Default password**: `admin` (factory) on older builds; per-device
  random on newer ones (printed as the "Access Key" on the label).
- **Session timeout**: ~10 minutes idle.

## UI specifics

- The frontend is a **mix of legacy iframe-based pages and modern SPA
  panels** depending on firmware era. Some builds (TG789/TG799) ship a
  **GAIA** UI with deep iframe nesting; others (CGA4233) ship a flat
  React SPA.
- Form widgets: **mostly vanilla `<select>` and `<input>`**; toggles are
  styled `<a>` links (e.g., `class="onoff_on" / onoff_off`).
- "Apply" / "Save" labels: **`Save`** (English builds, most common at
  Vivo); **`Aplicar`** (rare pt-BR builds); occasionally a circular
  arrow icon with no text.

## Pages map (DGA0122, firmware 17.x — Vivo Fibra)

| Page | URL |
|---|---|
| Login | `/` |
| Gateway summary | `/index` |
| Status — Internet | `/internet` |
| Status — Connected devices | `/devices` |
| Network — WAN config | `/network/wan` |
| Network — LAN/DHCP | `/network/lan` |
| Network — DHCP reservations | `/network/lan/dhcp` |
| Network — DNS | `/network/dns` |
| Wireless — 2.4 GHz | `/wireless/2.4ghz` |
| Wireless — 5 GHz | `/wireless/5ghz` |
| Wireless — Guest | `/wireless/guest` |
| Wireless — WPS | `/wireless/wps` |
| Application — Port forwarding | `/firewall/portforward` |
| Application — DMZ | `/firewall/dmz` |
| Application — UPnP | `/firewall/upnp` |
| Security — Firewall level | `/firewall` |
| System — Backup | `/system/backup` |
| System — Diagnostics | `/system/diagnostics` |

## Pages map (TG789 / TG799 — legacy GAIA UI)

GAIA uses iframes nested ~3 levels deep. Practical advice: don't try to
hit pages directly; navigate via the menu and let `frameLocator` chains
resolve them. If you must address by URL, the inner-most paths look like:

| Page | Inner URL |
|---|---|
| Wireless config | `/cgi/b/_wli_/cfg/?be=0` |
| LAN config | `/cgi/b/_lan_/cfg/?be=0` |
| Devices | `/cgi/b/devs/?be=0` |
| Diagnostics | `/cgi/b/_dsl_/diag/?be=0` |

The `?be=0` query string disables the iframe wrapper and returns the
naked content — handy for `dev-browser` to scrape without descending.

## Known firmware quirks

- **Per-build URL drift.** Even within one ISP's deployment, two firmware
  builds can use entirely different paths. Always start by walking the
  left-nav menu and harvesting URLs from `<a href>`, rather than
  hard-coding from this file.
- **Iframe-based GAIA UI** is fragile to clicking too fast — pause 500 ms
  between menu navigations.
- **Session cookie tied to source IP.** If the user's machine changes IP
  (Wi-Fi roam, lease bump) mid-session, the admin panel kicks them out
  with no error. Re-login on every Phase 3 change to stay safe.
- **Configuration backup is GPG-encrypted with an ISP-specific key** on
  Vivo deployments — it'll download, but the user can't open it
  off-device. Still worth saving as a disaster-recovery anchor (the same
  device can restore it).
- **Wi-Fi 6 builds (CGA4233) hide some advanced toggles** behind an
  "Expert mode" link in the wireless page — engage it before reading
  channel/width/MU-MIMO state.
- **Firewall has 4 levels** (None/Low/Medium/High); Vivo defaults to
  Medium which breaks NAT traversal for cameras and gaming. Standard
  Phase 2 candidate.

## Apply-and-verify pattern (per change)

1. Snapshot before: read current input value.
2. Apply: set field, click `button:has-text("Save"), button:has-text("Aplicar"), input[type=submit]`.
3. Wait for the page to re-render — SPA builds show a toast; GAIA reloads
   the inner frame; both take ~3–5 s.
4. Navigate away and back to force a fresh server read.
5. Re-read the value.
6. Match → continue. Mismatch → look for `.error`, `.errormsg`, or a
   GAIA-style `<div id="errMsg">`, log, stop.

## When in doubt

If a Technicolor build looks nothing like the maps above, fall back to
the generic walker: enumerate the menu, click each item, snapshot,
proceed. Document the new path map as a build-specific addendum at the
bottom of this file on the first successful run.
