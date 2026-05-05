# Vendor playbook: Sagemcom F@ST 3895

Tested end-to-end. This is the residential DOCSIS gateway commonly deployed by some Brazilian ISPs. UI is Portuguese; selectors and apply-button text below are exact.

## Connection

- **Default IP**: `192.168.0.1`
- **Login URL**: `https://<ROUTER_HOST>/2.0/gui/login`
- **Default username pattern**: vendor prefix + 6 hex chars from the MAC label (e.g. `OPERATOR_AB12CD`). May have been changed by the technician — don't assume.
- **Default password**: factory password follows a documented pattern from the ISP label (look for it on the bottom sticker). If a default-password audit is run, regex against the known pattern and warn if it still matches.
- **Session timeout**: ~10 minutes idle.

## UI specifics

- The frontend is **Angular**; dropdowns are `ng-select` widgets, **not** native `<select>`.
- Apply-button text: **`Aplicar Ajustes`**.
- Site-survey button text: **`Varredura de Pontos de Acesso Wi-Fi`** (~30 s scan).
- Tab buttons (`2.4 GHz` / `5 GHz`): exact text — match with `:has-text(...)`.
- DHCP lease input id: `#lease-time` (in seconds).
- **`Atual: X`** lines reflect the backend-confirmed state. Parse these for verification, not the dropdown text.

## ng-select interaction

```js
await page.click("ng-select[name=NAME]");
await page.waitForTimeout(700);
const opts = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".ng-dropdown-panel .ng-option"))
    .map(o => o.innerText.trim())
);
await page.locator(".ng-dropdown-panel .ng-option")
  .filter({ hasText: /^TARGET$/ }).first().click();
```

Common `ng-select` names:

| Name | Purpose | Values |
|---|---|---|
| `controlChannel` | Wi-Fi channel | numeric or `Auto` |
| `bandWidth` | Wi-Fi width | `20 MHz`, `40 MHz`, `80 MHz` |
| `wifiWPS` | WPS toggle | `Habilitar` / `Desabilitar` |
| `wifiApIsolation` | AP isolation | `Ativado` / `Desativado` |

## Pages map

| Page | URL |
|---|---|
| Login | `/2.0/gui/login` |
| Quick config (devices summary) | `/2.0/gui/pages/configuracao-rapida` |
| Status — Software/firmware | `/2.0/gui/pages/status/software` |
| Status — DOCSIS RF | `/2.0/gui/pages/status/conexao-rf` |
| Status — IP connection | `/2.0/gui/pages/status/conexao-ip` |
| Network — Basic config | `/2.0/gui/pages/rede/configuracoes-basicas` |
| Network — LAN/DHCP | `/2.0/gui/pages/rede/lan-dhcp` |
| Network — DNSv4 | `/2.0/gui/pages/rede/dnsv4` |
| Network — WAN config | `/2.0/gui/pages/rede/wan-configuration` |
| Advanced — Options | `/2.0/gui/pages/avancado/avancado-opcoes-avancadas` |
| Advanced — Port forwarding | `/2.0/gui/pages/avancado/avancado-encaminhamento` |
| Advanced — DMZ | `/2.0/gui/pages/avancado/avancado-dmz-host` |
| Security — Firewall | `/2.0/gui/pages/seguranca/firewall` |
| Security — MAC filter | `/2.0/gui/pages/seguranca/controle-acesso/filtragem-mac-address` |
| Wi-Fi — Radio | `/2.0/gui/pages/wi-fi/wifi-radio` |
| Wi-Fi — Main network | `/2.0/gui/pages/wi-fi/rede-principal` |
| Wi-Fi — Guest/IoT | `/2.0/gui/pages/wi-fi/wifi-guest` |
| Wi-Fi — Connected devices | `/2.0/gui/pages/wi-fi/equipamentos-conectados` |
| Wi-Fi — Mesh topology | `/2.0/gui/pages/wi-fi/mesh-topology` |
| Admin — Router password | `/2.0/gui/pages/administracao/senha-roteador` |
| Admin — Backup (config XML) | `/2.0/gui/pages/administracao/backup` |

## Known firmware quirks

- **Site-survey on the 5 GHz tab returns 2.4 GHz neighbors only** (firmware bug). Don't use it as 5 GHz channel guidance — use a separate scan source.
- **Auto-channel on 5 GHz consistently lands on 132 (DFS)** after factory reset. DFS forces a 30-minute vacate on radar detection. Always force a UNII-3 channel (149/153/157/161).
- **DHCP reservation UI is removed** in this build — the feature itself does not exist; advise static IP in the client device instead.
- **Webserver throttling**: pause ≥ 8 s between consecutive `Aplicar Ajustes` clicks. Spamming locks the webserver and `<app-root>` may render blank for ~1 minute.
- **Blank-page recovery**: if the page renders blank for >30 s, abandon the current page object and create a fresh anonymous one with `browser.newPage()`. The named page stays poisoned.

## Apply-and-verify pattern (per change)

1. Snapshot before: read both the dropdown value and the `Atual: X` line.
2. Apply the change via `ng-select` interaction above.
3. Click `Aplicar Ajustes`. Wait 5–8 s.
4. Reload the page. Parse the `Atual: X` line.
5. **Match** → log success. **Mismatch** → stop the run and report.
6. Re-login every 3 changes or whenever the session times out.
