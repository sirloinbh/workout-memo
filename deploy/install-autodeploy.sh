#!/bin/bash
# Installs and starts the pull-based deployment timer (#75). Run as root on the server:
#   sudo bash /opt/workout-memo/deploy/install-autodeploy.sh
set -euo pipefail
dir=$(cd "$(dirname "$0")" && pwd)
install -m 644 "$dir/workout-autodeploy.service" /etc/systemd/system/workout-autodeploy.service
install -m 644 "$dir/workout-autodeploy.timer" /etc/systemd/system/workout-autodeploy.timer
systemctl daemon-reload
systemctl enable --now workout-autodeploy.timer
systemctl list-timers workout-autodeploy.timer --no-pager
