# Vendor playbook: Huawei HG8245 / EG8145 (and close siblings)

GPON ONT family commonly deployed by Vivo Fibra and Oi Fibra in Brazil.
Variants seen in the wild: HG8245H, HG8245H5, HG8245Q2, EG8145V5, EG8145X6.
The web admin is broadly similar across them; differences are noted inline.

> **Important:** these gateways ship with a *dual-credential* model. The
> end-user password (printed on the label) unlocks a small subset of the UI;
> the **`telecomadmin`** super-account unlocks the full configuration. ISPs
> sometimes change the super-account password remotely. If discovery shows
> Wi-Fi/DHCP/firewall pages but no DOCSIS/ONT or "Engineering" tabs, you're
> on the user account — flag it in the report and don't fight the firmware.

## Connection

- **Default IP**: `192.168.100.1` (Vivo, Oi). A few deployments rebrand to
  `192.168.1.1`.
- **Login URL**: `https://<ROUTER_HOST>/` (form-based, no special path).
- **Default user-tier credentials**: `root` / `admin` (older firmware) or the
  username + password printed on the bottom label. Vivo deployments often use
  `Vivo` as the default user-tier login.
- **Default super-tier credentials** (when not changed by the ISP):
  `telecomadmin` / `admintelecom` for HG8245-series; `telecomadmin` /
  `admintelecom` or `telecomadmin` / `nE7jA%5m` for EG8145V5. **Do not**
  document the actual factory pattern in any report; just note "super
  account" or "user account" tier.
- **Session timeout**: ~5 minutes idle on most builds.
- **HTTPS**: HG8245H5 and newer redirect HTTP→HTTPS automatically; older
  HG8245 builds are HTTP-only on `:80`.

## UI specifics

- Backend is a custom HTTP server with **CSRF token** baked into a hidden
  `__RequestVerificationToken` input — `dev-browser` will pick it up
  automatically when submitting forms, but a raw `fetch` will be rejected.
- Most pages use **vanilla `<select>` and `<input>`** elements. No SPA
  framework — `page.selectOption` works directly.
- "Save" / "Apply" button labels: **`Apply`** (English builds), **`Aplicar`**
  (Brazilian-Portuguese builds), occasionally a checkmark icon with no text
  (use `[type=submit]`).
- Error toasts: `<div class="error_msg">` near the form.

## Pages map (HG8245H5 / EG8145V5)

| Page | URL |
|---|---|
| Login | `/` |
| Status — Device info | `/html/status/deviceinfo.asp` |
| Status — WAN | `/html/status/waninfo.asp` |
| Status — Optical (GPON RX/TX dBm) | `/html/status/optic.asp` |
| Status — User devices | `/html/status/lanuserinfo.asp` |
| WAN — Configuration | `/html/bbsp/wan/wan.asp` |
| LAN — DHCP server | `/html/bbsp/lan/lansetting.asp` |
| LAN — DHCP static lease | `/html/bbsp/lan/dhcpstatic.asp` |
| WLAN — Basic (per-band tabs) | `/html/bbsp/wlanbasic/wlanbasic.asp` |
| WLAN — Advanced | `/html/bbsp/wlanadvance/wlanadvance.asp` |
| WLAN — WPS | `/html/bbsp/wlanwps/wlanwps.asp` |
| Security — Firewall level | `/html/bbsp/firewall/firewallswitch.asp` |
| Security — IP filter | `/html/bbsp/firewall/ipfilter.asp` |
| Security — MAC filter | `/html/bbsp/firewall/macfilter.asp` |
| Forward — Port forwarding | `/html/bbsp/portmap/portmap.asp` |
| Forward — DMZ | `/html/bbsp/dmz/dmz.asp` |
| Forward — UPnP | `/html/bbsp/upnp/upnp.asp` |
| System — Maintenance | `/html/ssmp/maintain/maintain.asp` |
| System — Reboot | `/html/ssmp/reboot/reboot.asp` |
| Engineering (super-account only) | `/html/ssmp/teleright/teleright.asp` |

EG8145X6 (newer firmware) renames `bbsp` to `bbcp` in some paths — auto-detect
by trying both.

## Known firmware quirks

- **Wi-Fi tabs are radio buttons, not real tabs.** On `wlanbasic.asp`, the
  "2.4 GHz" / "5 GHz" toggle is a `<input type=radio>` that re-renders the
  form. Wait 500 ms after clicking before reading new field values.
- **Apply button does a full page reload**; the previous DOM is destroyed.
  Capture the screenshot *before* clicking, not after.
- **Country/region locked.** Vivo/Oi builds hard-pin region; trying to
  change it returns "operation not allowed". Don't propose it.
- **Optical RX power on `optic.asp`** is the most reliable upstream-health
  signal — capture it every run. Healthy: −8 to −24 dBm. Below −27 dBm
  starts flapping; report it as a non-actionable finding.
- **DHCP reservation UI exists** (unlike the Sagemcom build) — propose it
  when discovery finds devices on dynamic leases that should be static.
- **WPS is enabled by default** on most ISP shipments — propose disabling
  in Phase 2.
- The **HG8245H** (no suffix) has a much older UI with frames; treat as
  legacy, prefer to fall back to the generic walker.

## Apply-and-verify pattern (per change)

1. Snapshot before: read the input value via `page.inputValue(selector)`.
2. Apply: `page.selectOption` / `page.fill`, then click `button:has-text("Apply"), input[value=Apply], button:has-text("Aplicar")`.
3. The page reloads automatically; wait for `domcontentloaded`.
4. Re-read the value. The Huawei firmware writes back the *requested* value
   immediately on success and the *previous* value on failure (no error
   toast in some cases) — so the read-back is the only reliable signal.
5. Match → log success. Mismatch → check `<div class="error_msg">` for the
   reason, then stop the run.
