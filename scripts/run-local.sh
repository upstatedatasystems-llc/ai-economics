#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONPATH="$PWD/src"
exec python3 -m ai_economics serve --port 8765
