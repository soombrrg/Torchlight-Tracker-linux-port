#!/usr/bin/env bash
set -euo pipefail
tracker_runtime="${TLI_ELECTRON:-$(command -v electron43 || command -v electron)}"
exec xvfb-run -a -s '-screen 0 1280x720x24 -nolisten tcp' "$tracker_runtime" "$@"
