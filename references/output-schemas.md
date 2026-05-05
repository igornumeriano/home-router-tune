# Output schemas

Every phase writes a human-readable `.md` artifact and (where useful) a machine-readable `.json` companion under `./router-tune/`. The JSON files exist so future runs can do trend analysis (e.g. "DOCSIS SNR dropped 3 dB over the last 5 runs") and so Phase 3 can replay an approved plan deterministically.

## `discovery-<ts>.json`

```json
{
  "ts": "20260504-153000",
  "vendor": "sagemcom-fast-3895",
  "host": "192.168.0.1",
  "firmware": "7.7.X",
  "docsis": {
    "downstream": [{"channel": 1, "snr_db": 38.5, "power_dbmv": 0.5, "errors": 0}],
    "upstream":   [{"channel": 1, "power_dbmv": 42.0}]
  },
  "wifi": {
    "2_4ghz": {"channel": 6, "width_mhz": 20, "wps": false, "ap_isolation": false},
    "5ghz":   {"channel": 132, "width_mhz": 80, "wps": false, "ap_isolation": false}
  },
  "lan": {
    "dhcp_range": "192.168.0.10-192.168.0.254",
    "lease_seconds": 86400,
    "reservations_supported": false
  },
  "neighborhood": [
    {"ssid": "neighbor-1", "band": "2_4ghz", "channel": 1, "rssi_dbm": -52}
  ],
  "connected_devices": [
    {"mac": "aa:bb:cc:dd:ee:ff", "ip": "192.168.0.50", "band": "5ghz", "rssi_dbm": -55, "vendor_oui": "Apple"}
  ],
  "anomalies": [
    "5 GHz channel reverted from 149 to 132 since previous run (suspect ISP TR-069 push)"
  ]
}
```

## `plan-<ts>.json`

Machine-readable companion to the markdown plan. Phase 3 replays this deterministically; future runs compare plans by `id` to detect "we did this before — did it stick?".

```json
{
  "ts": "20260504-153000",
  "vendor": "sagemcom-fast-3895",
  "host": "192.168.0.1",
  "actions": [
    {
      "id": "wifi-5g-channel",
      "category": "wifi-radio",
      "severity": "high",
      "risk": "brief",
      "reversibility": "trivial",
      "page": "/2.0/gui/pages/wi-fi/wifi-radio",
      "tab": "5 GHz",
      "control": { "type": "ng-select", "name": "controlChannel" },
      "before": { "dropdown": "Auto", "actual": "132" },
      "after":  { "dropdown": "149",  "actual": "149" },
      "apply_button": "Aplicar Ajustes",
      "verify": { "regex": "Atual:\\s*149" },
      "rationale": "DFS channel forces 30-min vacate on radar; UNII-3 has higher allowed power and is interference-free."
    }
  ]
}
```

The `id` field must be **stable across runs** so `history.md` can correlate "we did this 3 weeks ago and it stuck" vs "we did it 3 times, ISP keeps reverting".

### Action field semantics

| Field | Values | Notes |
|---|---|---|
| `category` | `wifi-radio` / `wifi-security` / `dhcp` / `firewall` / `advanced` / `housekeeping` | |
| `severity` | `high` / `medium` / `low` | high = real instability; medium = measurable improvement; low = hygiene |
| `risk` | `none` / `brief` / `disruptive` | brief ≈ radio reset (~30 s); disruptive = full reboot |
| `reversibility` | `trivial` / `manual` / `hard` | trivial = one click back; manual = need to remember old value |

## `metrics-<ts>.json`

Numbers Phase 4 uses for before/after deltas. Optional — populated when the relevant binaries are available.

```json
{
  "ts": "20260504-153000",
  "speedtest": {
    "download_mbps": 487.2,
    "upload_mbps": 39.1,
    "ping_ms": 8.4,
    "jitter_ms": 0.7
  },
  "latency": {
    "1.1.1.1": {"min_ms": 7, "avg_ms": 9, "max_ms": 12, "loss_pct": 0},
    "router":  {"min_ms": 1, "avg_ms": 1, "max_ms": 2,  "loss_pct": 0}
  },
  "docsis_health": {
    "downstream_min_snr_db": 38.5,
    "upstream_max_power_dbmv": 42.0,
    "uncorrectables_total": 14
  }
}
```

## `webhook-payload.json` (NOTIFY_WEBHOOK)

If `NOTIFY_WEBHOOK` is set, POST a one-line summary at end of run:

```json
{
  "ts": "20260504-153000",
  "host": "192.168.0.1",
  "vendor": "sagemcom-fast-3895",
  "changes_applied": 5,
  "failures": 0,
  "anomalies": ["DOCSIS error count growing", "1 camera offline since last run"],
  "report_path": "./router-tune/report-20260504-153000.md"
}
```

Never include credentials or sensitive details in the payload.
