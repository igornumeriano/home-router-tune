# Vendor playbook: ZTE F670L (and close siblings)

GPON ONT with built-in Wi-Fi 5/6, very common at Vivo Fibra and TIM Live in
Brazil. Sibling models with similar UIs: F660, F668, F680, F6600P, F6640.

> **Important:** ZTE ships a *triple-credential* model — `user`,
> `useradmin`, and `superadmin` — each unlocking a wider slice of the UI.
> The label on the modem usually shows the `user` credentials only. The
> `superadmin` password is set by the ISP and is what you actually need for
> a tune. If discovery shows only "Internet/WLAN/Local Network" tabs and no
> "Administration" or "Management" sections, you're on a lower tier — flag
> in the report.

## Connection

- **Default IP**: `192.168.1.1` (Vivo Fibra). Some TIM deployments use
  `192.168.0.1`.
- **Login URL**: `https://<ROUTER_HOST>/` (older HTTP-only firmware on `:80`).
- **Default `user` credentials**: `user` / `user` (factory) or as printed
  on the bottom label.
- **Default `superadmin` credentials** (when not changed by the ISP): vary
  per build; many F670L deployments use `superadmin` / `<8-char string from
  label>` or `admin` / `<8-char string>`. Don't store factory patterns in
  reports.
- **Session timeout**: ~3 minutes idle (aggressive). Re-login often.
- **Single-session limit**: only one admin session at a time. If discovery
  fails with "another user is logged in", another tab/computer is holding
  the lock — wait it out or kill via reboot.

## UI specifics

- Backend is a Lua-driven HTTP server. Pages are mostly server-rendered;
  some forms post via XHR with a custom `_TESTCOOKIE_=1` round-trip.
- Form widgets are **vanilla `<select>` and `<input>`**, but several
  important toggles are styled `<a class="switch_on">` / `switch_off`
  links — click them, don't try to set a value.
- "Apply" / "Submit" button: **`Submit`** in English builds (most common),
  **`Aplicar`** in pt-BR builds. Inline validation; failures render in a
  `<div class="popup_msg">` overlay — close with `Esc` before retrying.

## Pages map (F670L V9 firmware)

| Page | URL |
|---|---|
| Login | `/` |
| Status — Device info | `/?_type=menuView&_tag=devInfo` |
| Status — PON link | `/?_type=menuView&_tag=ponInfo` |
| Status — WAN connection | `/?_type=menuView&_tag=internetStatus` |
| Network — WAN setup | `/?_type=menuView&_tag=internetSettings` |
| Network — LAN/DHCP | `/?_type=menuView&_tag=lanSettings` |
| Network — DHCP static | `/?_type=menuView&_tag=dhcpStaticLease` |
| Local Network — Wi-Fi basic (per-band) | `/?_type=menuView&_tag=wlanBasic` |
| Local Network — Wi-Fi advanced | `/?_type=menuView&_tag=wlanAdvance` |
| Local Network — WPS | `/?_type=menuView&_tag=wlanWPS` |
| Local Network — MAC ACL | `/?_type=menuView&_tag=wlanACL` |
| Application — Port forwarding | `/?_type=menuView&_tag=portForwarding` |
| Application — DMZ | `/?_type=menuView&_tag=dmz` |
| Application — UPnP | `/?_type=menuView&_tag=upnp` |
| Security — Firewall | `/?_type=menuView&_tag=firewall` |
| Security — Parental control | `/?_type=menuView&_tag=parentalControl` |
| Administration — User management | `/?_type=menuView&_tag=userMgmt` |
| Administration — System management | `/?_type=menuView&_tag=systemMgmt` |
| Administration — Backup config | `/?_type=menuView&_tag=backupRestore` |

The `?_type=menuView&_tag=<id>` pattern is consistent — auto-detect tags
from the left-nav menu rather than hard-coding when in doubt.

## Known firmware quirks

- **Login fails silently with the wrong tier credentials.** The form
  reloads with no error message. After 3 silent failures, watch for a
  brief lockout (~60 s).
- **PON optical RX power** is on the "Status → PON link" page — capture
  every run. Healthy: −8 to −27 dBm.
- **Wi-Fi changes apply per-band but the page does not reload.** After
  clicking Submit, the page shows a green "Submit successful" toast but
  the form fields keep showing the old values for ~3 s. Always navigate
  away and back to verify, don't trust the in-place form.
- **Channel "Auto" sticks**. Even after setting an explicit channel, the
  Auto-channel daemon may revert it within 24 h. Rerun the audit a day
  later to confirm; if it reverts, propose disabling auto-channel
  selection in advanced Wi-Fi settings.
- **WPA3** is supported on F670L V9+ but defaults to WPA2 — propose
  upgrading to WPA2/WPA3 mixed only after confirming all clients ≥ 2020.
- **TR-069 push reverts firewall settings** on Vivo deployments roughly
  every 30 days. Document in `history.md` so future runs detect the
  pattern.

## Apply-and-verify pattern (per change)

1. Snapshot before: read input value.
2. Apply: set field, click `button:has-text("Submit"), button:has-text("Aplicar")`.
3. Wait 4 s, then **navigate away** (e.g., to Status) and **back** to the
   page — the form re-renders from server state.
4. Re-read the value.
5. Match → success. Mismatch → check for popup_msg overlay, log, stop.
