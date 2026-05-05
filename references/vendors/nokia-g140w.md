# Vendor playbook: Nokia G-140W and G-1425G-A

GPON ONT family used by Vivo Fibra (and historically Telefónica/Movistar in
LATAM). Variants seen: G-140W-MD, G-140W-MR, G-1425G-A, G-1425G-B. Web admin
is broadly similar; minor menu-naming differences only.

> Nokia gateways behave more "vanilla" than the Huawei/ZTE pair. There's no
> super-account pattern — the single admin login (when ISP-provisioned)
> exposes the full UI. Nokia firmware is also one of the most stable; expect
> fewer of the apply-and-revert quirks documented elsewhere.

## Connection

- **Default IP**: `192.168.1.1` (most common); `192.168.0.1` on a few Vivo
  shipments; `10.0.0.1` very rarely.
- **Login URL**: `https://<ROUTER_HOST>/` (HTTP-only on older firmware).
- **Default user**: `admin` (factory) — Vivo deployments often change this
  to `vivo`, `Vivo`, or `<numeric customer-id>`. Check the bottom label.
- **Default password**: printed on the bottom label as a 6–10 char string;
  random per device.
- **Session timeout**: ~10 minutes idle.
- **HTTPS cert**: self-signed; dev-browser will accept.

## UI specifics

- Frontend is a **mix of legacy iframes and modern AJAX panels**, depending
  on firmware build. The login page may reload into a `<frameset>` — the
  agent must descend with `page.frameLocator("frame[name=mainFrame]")` (or
  similar) before it can interact with the menu.
- Form widgets: vanilla `<select>` and `<input>`; toggles are styled
  checkboxes.
- "Apply" / "Save" button: **`Apply`** (English) or **`Aplicar`** (pt-BR).
  Some pages have a separate `Save` step *after* Apply that persists the
  change across reboots — always click both when present.

## Pages map (G-140W-MD, firmware 3FE48132)

Paths assume the user has descended into the `mainFrame` iframe.

| Page | URL fragment |
|---|---|
| Login | `/` |
| Status — Device | `/devsts.html` |
| Status — GPON RX/TX | `/gponhdr.html` |
| Status — WAN | `/wanstat.html` |
| Status — DHCP leases | `/lansts.html` |
| Network — WAN config | `/wancfg.html` |
| Network — LAN setup | `/lancfg.html` |
| Network — DHCP server | `/dhcpcfg.html` |
| Network — DHCP reservation | `/dhcpres.html` |
| Wireless — Basic (per-band) | `/wlcfg.html` |
| Wireless — Advanced | `/wladv.html` |
| Wireless — WPS | `/wlwps.html` |
| Wireless — MAC filter | `/wlfilter.html` |
| Application — NAT/Port forward | `/natcfg.html` |
| Application — DMZ | `/dmzcfg.html` |
| Application — UPnP | `/upnp.html` |
| Security — Firewall | `/fwcfg.html` |
| Maintenance — Backup/Restore | `/maintbackup.html` |
| Maintenance — Reboot | `/maintreboot.html` |

G-1425G-A renames a few paths (e.g., `wlcfg.html` → `wifibasic.html`); auto-
detect from the left-nav before assuming.

## Known firmware quirks

- **Iframe reload kills selectors.** After Apply, the inner frame
  navigates; the previously cached `frameLocator` is dead. Re-acquire it
  every Phase 3 step.
- **Two-step save**: some pages require Apply *and then* a global "Save
  Configuration" click in the admin → maintenance area to persist across a
  reboot. Without the second step, settings revert after a power blip.
  Always do both at the end of Phase 3.
- **GPON RX power on `gponhdr.html`** is reliable — capture every run.
  Healthy: −8 to −27 dBm.
- **WLAN page renders blank for ~2 s** after submitting — wait, don't
  panic-retry.
- **No DOCSIS** (it's GPON) — the standard-candidate "DOCSIS errors total"
  finding doesn't apply. Use GPON BER and corrected/uncorrected codeword
  counts from `gponhdr.html` instead.
- **Wi-Fi 6 builds (G-1425G-A) default to 80 MHz on 5 GHz** — usually
  fine, but in dense urban deployments propose narrowing to 40 MHz to
  reduce co-channel interference.

## Apply-and-verify pattern (per change)

1. Snapshot before: read input value via the iframe context.
2. Apply: set field, click `Apply` / `Aplicar` button inside the frame.
3. Wait for the inner frame to finish reloading (`framenavigated` event,
   or a 4 s timeout fallback).
4. Re-acquire the frame locator and re-read the value.
5. Match → continue. After all changes, navigate to maintenance and click
   the global Save Configuration button.
6. Mismatch → check for inline error in the frame, log, stop.
