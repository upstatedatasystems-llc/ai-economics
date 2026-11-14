#!/usr/bin/env bash
set -euo pipefail
if [[ "$(id -u)" != "0" ]]; then
  echo "Run with sudo" >&2
  exit 1
fi
if [[ ! -f /opt/ai-economics/research/catalog.json ]]; then
  echo "Clone repo to /opt/ai-economics first" >&2
  exit 1
fi
id ai-economics >/dev/null 2>&1 || useradd --system --home /opt/ai-economics --shell /usr/sbin/nologin ai-economics
mkdir -p /opt/ai-economics/var /opt/ai-economics/site/data
chown -R ai-economics:ai-economics /opt/ai-economics/var /opt/ai-economics/site/data
install -m 0644 /opt/ai-economics/systemd/ai-economics-refresh.service /etc/systemd/system/
install -m 0644 /opt/ai-economics/systemd/ai-economics-refresh.timer /etc/systemd/system/
systemctl daemon-reload
echo "Installed units. Review then run: sudo systemctl enable --now ai-economics-refresh.timer"
