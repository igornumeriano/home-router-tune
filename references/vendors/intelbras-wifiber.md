# Vendor playbook: Intelbras (Wi-Fiber, Twibi, ACtion families)

Brazilian vendor. Used by smaller ISPs (regional fiber providers) as the
"BYOD" recommendation, and very common in retail for users who reject the
ISP-provided modem and run their own router behind it. UI is in
Portuguese, modern (React/SPA on newer builds, jQuery on older).

Variants seen:
- **Wi-Fiber** (110 G, 121 AC, 1200 R, 1200 X, AX 1800V, AX 3000V) — GPON
  ONT family.
- **Twibi** (Force, Giga+, AX) — mesh routers; behind-modem deployment.
- **ACtion** (R1200, RX 1500, RG 1200) — standalone routers; behind-modem.

> The non-Wi-Fiber product lines are *routers behind a modem* — the WAN
> side is just DHCP/PPPoE, no DOCSIS or GPON. Phase 1 should still capture
> WAN, LAN, and Wi-Fi state, but skip the operator-link checks (no
> SNR/optical-power equivalents to worry about).

## Connection

- **Default IP** (varies by family):
  - Wi-Fiber: `10.0.0.1` (factory) or `192.168.1.1` (some ISP rebrandings).
  - Twibi: `10.0.0.1`.
  - ACtion: `10.0.0.1` or `192.168.0.1`.
- **Login URL**: `http://<ROUTER_HOST>/` (most builds are HTTP-only;
  newer Wi-Fiber AX firmware redirects to HTTPS).
- **Default user**: `admin` on most builds; `intelbras` on a few legacy
  ACtion firmwares.
- **Default password**: `admin` factory (older firmware) or as printed on
  the bottom label (newer firmware enforces a per-device random).
- **Session timeout**: ~5 minutes idle.

## UI specifics

- **Newer Wi-Fiber AX builds** ship a **React SPA**. Paths are
  client-routed (`#/wireless`, `#/network/lan`); use `page.click` on
  menu items rather than direct `goto`, and wait for the inner content
  to render.
- **Older Wi-Fiber and ACtion builds** are **jQuery + iframes** — descend
  with `frameLocator` like the Nokia playbook.
- **Twibi mesh** uses a **mobile-first SPA** that's awkward to navigate
  on desktop; consider Phase 1 read-only via the Twibi mobile app's
  underlying API instead (out of scope for v1 — fall back to manual page
  walking).
- "Apply" / "Save" button: **`Aplicar`** or **`Salvar`** (always
  Portuguese, unlike the multi-language vendors).

## Pages map (Wi-Fiber 121 AC, firmware 1.2.x)

| Page | URL / SPA route |
|---|---|
| Login | `/` |
| Status — Device | `/#/status/device` or `/status_device.html` |
| Status — GPON | `/#/status/gpon` or `/status_gpon.html` |
| Status — Connected devices | `/#/status/clients` or `/status_clients.html` |
| Network — WAN | `/#/network/wan` or `/network_wan.html` |
| Network — LAN | `/#/network/lan` or `/network_lan.html` |
| Network — DHCP | `/#/network/dhcp` or `/network_dhcp.html` |
| Wireless — 2.4 GHz basic | `/#/wireless/24/basic` or `/wireless_24.html` |
| Wireless — 5 GHz basic | `/#/wireless/5/basic` or `/wireless_5.html` |
| Wireless — Advanced | `/#/wireless/advanced` |
| Wireless — WPS | `/#/wireless/wps` |
| Wireless — MAC filter | `/#/wireless/macfilter` |
| Application — Port forwarding | `/#/application/portforward` |
| Application — DMZ | `/#/application/dmz` |
| Application — UPnP | `/#/application/upnp` |
| Security — Firewall | `/#/security/firewall` |
| System — Backup | `/#/system/backup` |
| System — Reboot | `/#/system/reboot` |

## Pages map (ACtion R1200)

The ACtion family has a flatter menu; relevant paths:

| Page | URL |
|---|---|
| Login | `/` |
| Internet (WAN) | `/internet.html` |
| Wireless | `/wireless.html` |
| Network — DHCP | `/dhcp.html` |
| Forwarding | `/forwarding.html` |
| Security | `/security.html` |
| System Tools | `/system.html` |

## Known firmware quirks

- **Default-password warning is dismissible permanently.** If the user has
  never changed the admin password, Wi-Fiber shows a banner on every
  login. Discovery should detect the banner and propose changing the
  admin password as a `high` severity item.
- **Wireless page resets values on tab switch.** Switching from "2.4 GHz"
  to "5 GHz" without clicking Apply *discards* unsaved changes silently.
  In Phase 3, apply each band before switching tabs.
- **Channel auto-selection on 2.4 GHz is poor** in dense Brazilian
  apartment buildings (default lands on channels with heavy overlap).
  Almost always worth a manual Phase 2 proposal.
- **Twibi nodes do not expose per-node admin** — the master is the only
  configurable point; non-master nodes only show status. Don't try to
  log into individual mesh nodes.
- **No GPON optical-power page on ACtion/Twibi** (they're not ONTs).
  Skip the optical-RX standard finding for those families.
- **Firmware OTA from Intelbras is opt-in** (unlike ISP OTA which is
  forced). Less drift between runs — `history.md` patterns should be
  stable.

## Apply-and-verify pattern (per change)

1. Snapshot before: read current value (input or SPA-state read).
2. Apply: set field, click `button:has-text("Aplicar"), button:has-text("Salvar")`.
3. Wait for the toast (`.toast-success`, `.notification-success`, or a
   redirect back to the menu) — typically 2 s.
4. Re-render the page (SPA: re-click the menu item; legacy: reload).
5. Re-read the value.
6. Match → continue. Mismatch → look for `.alert-danger` / `.error-msg`,
   log, stop.
