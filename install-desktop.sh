#!/usr/bin/env bash
set -euo pipefail

tracker_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tracker_data_home="${XDG_DATA_HOME:-${HOME}/.local/share}"
tracker_applications="${tracker_data_home}/applications"
tracker_target="${tracker_applications}/torchlight-tracker.desktop"
tracker_temporary="$(mktemp -d)"
trap 'rm -rf -- "$tracker_temporary"' EXIT

# Generate host-specific paths locally; only Bash and coreutils are required.
tracker_launcher="${tracker_root}/run-linux.sh"
[[ -x "${tracker_root}/Torchlight-Tracker" ]] && tracker_launcher="${tracker_root}/Torchlight-Tracker"
tracker_icon="${tracker_root}/linux/app/etor.png"
[[ -f "${tracker_root}/resources/etor.png" ]] && tracker_icon="${tracker_root}/resources/etor.png"

desktop_value() {
  local tracker_value="$1"
  tracker_value="${tracker_value//\\/\\\\}"
  tracker_value="${tracker_value//$'\n'/\\n}"
  tracker_value="${tracker_value//$'\r'/\\r}"
  tracker_value="${tracker_value//$'\t'/\\t}"
  printf '%s' "$tracker_value"
}

desktop_executable() {
  local tracker_value="${1//%/%%}"
  tracker_value="${tracker_value//\\/\\\\}"
  tracker_value="${tracker_value//\"/\\\"}"
  tracker_value="${tracker_value//\`/\\\`}"
  tracker_value="${tracker_value//\$/\\\$}"
  desktop_value "\"${tracker_value}\""
}

{
  printf '%s\n' '[Desktop Entry]' 'Version=1.0' 'Type=Application' 'Name=Torchlight Tracker'
  printf '%s\n' 'Comment=Farming and loot tracker for Torchlight: Infinite'
  printf 'Exec=%s\n' "$(desktop_executable "$tracker_launcher")"
  printf 'Path=%s\n' "$(desktop_value "$tracker_root")"
  printf 'Icon=%s\n' "$(desktop_value "$tracker_icon")"
  printf '%s\n' 'Terminal=false' 'Categories=Game;' 'Keywords=Torchlight;Infinite;TLI;Tracker;ETor;трекер;'
  printf '%s\n' 'StartupNotify=true' 'StartupWMClass=etor-linux' 'X-Torchlight-Tracker-Port=true'
} > "$tracker_temporary/torchlight-tracker.desktop"

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
