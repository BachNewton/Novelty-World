#!/usr/bin/env bash
# Builds the relay into one file and installs it on the Oracle server
# (infra/oracle/README.md), then restarts it, which waits for it to report it is listening.
set -euo pipefail
cd "$(dirname "$0")/.."

out=.relay-dist
rm -rf "$out"
# ws loads these optional native speed-ups only if present; the relay runs without them.
npx esbuild relay/main.ts --bundle --platform=node --target=node24 --format=cjs \
  --external:bufferutil --external:utf-8-validate --outfile="$out/relay.cjs" --log-level=warning
cp infra/oracle/novelty-relay.service "$out/"

scp -q "$out/relay.cjs" "$out/novelty-relay.service" novelty-oracle:/tmp/
ssh novelty-oracle 'set -e
  id relay >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin relay
  sudo install -d -m 755 /opt/novelty-relay
  sudo install -m 644 /tmp/relay.cjs /opt/novelty-relay/relay.cjs
  sudo install -m 644 /tmp/novelty-relay.service /etc/systemd/system/novelty-relay.service
  rm /tmp/relay.cjs /tmp/novelty-relay.service
  sudo systemctl daemon-reload
  sudo systemctl enable --quiet novelty-relay
  # Type=notify: this returns once the relay reports it is listening, or fails.
  sudo systemctl restart novelty-relay || { journalctl -u novelty-relay -n 30 --no-pager; exit 1; }
  curl -fsS http://127.0.0.1:8080/health >/dev/null
  echo "relay is up: $(systemctl show -p MainPID --value novelty-relay) using $(( $(systemctl show -p MemoryCurrent --value novelty-relay) / 1048576 )) MB"'
