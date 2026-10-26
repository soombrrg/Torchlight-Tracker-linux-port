#!/usr/bin/env bash
set -euo pipefail

tracker_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tracker_data_home="${XDG_DATA_HOME:-${HOME}/.local/share}"
tracker_applications="${tracker_data_home}/applications"
tracker_target="${tracker_applications}/torchlight-tracker.desktop"
tracker_temporary="$(mktemp -d)"
trap 'rm -rf -- "$tracker_temporary"' EXIT

# Resolve paths at installation time so this also works after moving the port.
python3 - "$tracker_root" "$tracker_temporary/torchlight-tracker.desktop" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])

def value(text):
    return str(text).replace('\\', '\\\\').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')

def executable(text):
    escaped = str(text).replace('%', '%%')
    for char in ('\\', '"', '`', '$'):
        escaped = escaped.replace(char, '\\' + char)
    return value('"' + escaped + '"')

entry = '\n'.join([
    '[Desktop Entry]',
    'Version=1.0',
    'Type=Application',
    'Name=Torchlight Tracker',
    'Comment=Farming and loot tracker for Torchlight: Infinite',
    'Exec=' + executable(root / 'run-linux.sh'),
    'Path=' + value(root),
    'Icon=' + value(root / 'linux/app/etor.png'),
    'Terminal=false',
    'Categories=Game;',
    'Keywords=Torchlight;Infinite;TLI;Tracker;ETor;трекер;',
    'StartupNotify=true',
    'StartupWMClass=etor-linux',
    'X-Torchlight-Tracker-Port=true',
    '',
])
pathlib.Path(sys.argv[2]).write_text(entry, encoding='utf-8')
PY

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$tracker_temporary/torchlight-tracker.desktop"
fi

mkdir -p -- "$tracker_applications"
if [[ -e "$tracker_target" ]] && ! cmp -s -- "$tracker_target" "$tracker_temporary/torchlight-tracker.desktop"; then
  cp -p -- "$tracker_target" "${tracker_target}.bak.$(date +%Y%m%d%H%M%S)"
fi
install -m 644 -- "$tracker_temporary/torchlight-tracker.desktop" "$tracker_target"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$tracker_applications"
fi
printf '%s\n' 'Installed: Torchlight Tracker. Press Win+Space and search for Torchlight Tracker.'
