#!/usr/bin/env sh
# home-router-tune — dependency probe
#
# Prints a stable, parseable status table the agent can read on every Phase 1
# pre-flight. Exit code is always 0; missing optional tools degrade gracefully.
#
# Usage: sh scripts/doctor.sh
# Output: one line per dep — `<name>\t<status>\t<detail>`
#         status ∈ ok | missing | optional-missing
#
# Required: arp (POSIX, virtually always present)
# Required (provided by Claude Code): dev-browser skill
# Optional: nmap, speedtest, ping, mtr, jq, curl, wdutil/airport (macOS scan)

set -u

probe() {
    name=$1
    kind=$2  # required | optional
    detect=$3

    if [ -n "$detect" ] && command -v "$detect" >/dev/null 2>&1; then
        version=$("$detect" --version 2>/dev/null | head -n1 || echo "")
        if [ -z "$version" ]; then
            version=$("$detect" -V 2>/dev/null | head -n1 || echo "available")
        fi
        printf '%s\tok\t%s\n' "$name" "$version"
    else
        if [ "$kind" = "required" ]; then
            printf '%s\tmissing\trequired but not on PATH\n' "$name"
        else
            printf '%s\toptional-missing\tfeature degrades gracefully\n' "$name"
        fi
    fi
}

# ---- required ---------------------------------------------------------------
probe arp required arp

# ---- optional: scanning -----------------------------------------------------
probe nmap optional nmap

# ---- optional: throughput ---------------------------------------------------
if command -v speedtest-cli >/dev/null 2>&1; then
    probe speedtest optional speedtest-cli
elif command -v speedtest >/dev/null 2>&1; then
    probe speedtest optional speedtest
else
    printf '%s\toptional-missing\tno speedtest-cli or Ookla speedtest on PATH\n' speedtest
fi

# ---- optional: latency / path ----------------------------------------------
probe ping optional ping
probe mtr  optional mtr

# ---- optional: helpers ------------------------------------------------------
probe jq   optional jq
probe curl optional curl

# ---- macOS Wi-Fi scan -------------------------------------------------------
if [ "$(uname)" = "Darwin" ]; then
    if command -v wdutil >/dev/null 2>&1; then
        printf '%s\tok\twdutil (macOS 14+)\n' wifi-scan
    elif [ -x /System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport ]; then
        printf '%s\tok\tairport (legacy)\n' wifi-scan
    else
        printf '%s\toptional-missing\tno wdutil or airport — rely on modem-side scan\n' wifi-scan
    fi
else
    printf '%s\toptional-missing\tnon-macOS — rely on modem-side scan\n' wifi-scan
fi

# ---- dev-browser ------------------------------------------------------------
# Cannot probe an MCP skill from a shell — the agent must check this itself
# by attempting a dev-browser command. We emit a hint line so the agent
# remembers to verify.
printf '%s\thint\tprobe via a no-op dev-browser command before Phase 1c\n' dev-browser
