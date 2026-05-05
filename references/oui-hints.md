# Device classification (MAC OUI)

When listing connected devices in discovery and reports, translate MAC OUIs into vendor labels for readability ("Apple — 192.168.0.50" beats a bare MAC).

## Cache strategy

Maintain `./router-tune/oui-cache.json` so future runs benefit from prior lookups.

```json
{
  "B8:AB:62": "Apple",
  "D0:CF:0E": "Sagemcom",
  "90:BF:D9": "Anker"
}
```

For unknown OUIs, optionally hit `https://api.macvendors.com/<MAC>` (rate-limited; cache the result before continuing).

## Apple MAC randomization

Apple devices set the **locally-administered bit** in the first octet, so the second hex digit is one of `2 / 6 / A / E` (e.g. `82:F8:FF`, `72:15:91`, `EE:EA:00`). These addresses **cannot** be tracked across SSID changes — Apple rotates them.

Note this in reports: do not try to match a randomized address to a historical entry, because the same physical device will appear under a different OUI after each network reset.

## Where labels are useful

- **Discovery tables**: replace bare MACs with vendor labels.
- **Anomaly detection**: a device that matches a known camera/IoT vendor and is offline → flag with priority (cameras tend to silently fall off Wi-Fi).
- **History trends**: easier to spot patterns like "this brand of bulb keeps disappearing" when names are present.
