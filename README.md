# home-router-tune

Audit and safely tune a home ISP modem/router from inside Claude Code. Four
gated phases — discover, plan, execute (only on user approval), report —
producing artifacts you can diff across runs to spot ISP-side drift.

> Every change is gated by **explicit human approval**. Phase 3 never runs
> on its own.

## What you get

- A read-only first pass that maps **every** admin-panel setting (Wi-Fi,
  DOCSIS health, DHCP, firewall, port-forwards, connected devices, mesh,
  remote management, …) plus a Wi-Fi neighborhood scan.
- A prioritized plan with severity / risk / reversibility for each
  proposed change — backed by Phase 1 evidence.
- Deterministic apply-and-verify in Phase 3 with a stop-on-first-failure
  rule and an automatic rollback recipe.
- A per-run report and an append-only `history.md` so future runs detect
  *"this drifted again — the ISP TR-069-pushed it back"*.
- Tested vendor playbooks for the most common ISP gateways shipped in
  Brazil; generic fallback for any other firmware.

## Supported vendors

| Playbook | ISPs (most commonly seen on) |
|---|---|
| `sagemcom-fast-3895` | Claro Net |
| `huawei-hg8245-eg8145` | Vivo Fibra, Oi Fibra |
| `zte-f670l` | Vivo Fibra, TIM Live |
| `nokia-g140w` | Vivo Fibra |
| `intelbras-wifiber` | regional ISPs, retail (Twibi/ACtion families) |
| `technicolor` | Vivo, historical Claro/NET |

Each playbook lives in `references/vendors/<id>.md` and documents the
login URL, default credentials patterns, page map, control selectors, and
known firmware quirks. Setting `ROUTER_VENDOR=<id>` in `.env` loads it
directly; otherwise the skill auto-detects from the login page.

## Install

This skill is distributed via [skills.sh](https://skills.sh):

```bash
sh -c "$(curl -fsSL https://skills.sh)" -- install home-router-tune
```

Or drop the directory into `~/.claude/skills/home-router-tune/`.

The only hard dependency is the [`dev-browser`](https://skills.sh/dev-browser)
skill, which the audit uses to drive admin panels. Optional helpers
(`speedtest-cli`, `nmap`, `mtr`, `jq`) light up extra features when
present and degrade gracefully when not.

## Quickstart

1. Trigger the skill in Claude Code. Anything from the obvious
   *"audit my router"* to vague *"my Wi-Fi is flaky after the ISP came by"*
   should pick it up.
2. The skill creates `./router-tune/.env.example` on first run. Copy it
   to `./router-tune/.env` and fill in `ROUTER_HOST`, `ROUTER_USER`,
   `ROUTER_PASS`. Re-trigger.
3. **Phase 1 — Discovery** runs unattended (~2 min) and writes
   `discovery-<ts>.md` plus screenshots.
4. **Phase 2 — Plan** writes `plan-<ts>.md` and asks you which items to
   apply (`all`, `1,3,5`, `skip 4`, etc.).
5. **Phase 3 — Execute** applies the approved subset, verifies each one,
   stops on first mismatch.
6. **Phase 4 — Report** writes the per-run report and appends a one-block
   summary to `history.md`.

## File layout (working directory)

```
your-project/
└── router-tune/
    ├── .env                  ← your credentials, gitignored
    ├── .gitignore            ← copied from assets/.gitignore
    ├── discovery-<ts>.md     ← Phase 1
    ├── discovery-<ts>.json
    ├── plan-<ts>.md          ← Phase 2 (review here)
    ├── plan-<ts>.json
    ├── exec-<ts>.log         ← Phase 3
    ├── report-<ts>.md        ← Phase 4
    ├── metrics-<ts>.json
    ├── history.md            ← cumulative
    ├── oui-cache.json
    ├── backups/              ← admin XML config backups
    └── screenshots/
```

JSON schemas for every artifact: `references/output-schemas.md`.

## Safety model

- Credentials are **read from disk only**, never asked interactively,
  never written to memory, transcripts, or any artifact under
  `./router-tune/`.
- Phase 1 and Phase 2 are **read-only**. The plan is just markdown +
  JSON until you approve.
- Phase 3 stops at the first verification mismatch and produces a
  rollback recipe.
- An XML config backup is downloaded on every run (when the firmware
  exposes one) to `backups/`, providing a one-click restore if anything
  goes wrong.

## Adding a new vendor

When you confirm a new firmware works end-to-end, drop a playbook in
`references/vendors/<id>.md` modeled after the existing files. The
skill picks it up automatically. PRs welcome — see the existing
playbooks for the expected sections (Connection, UI specifics,
Selectors, Pages map, Known firmware quirks, Apply-and-verify pattern).

## License

MIT.
