#!/bin/sh
# Cron entry point (every minute): probe usage about every 15 s for the minute, push to the Gist when the
# numbers change, and at least every 5 min so the widget can tell fresh from stale.
# A failed probe or upload leaves the Gist as is (widget shows "stale"); the next pass retries.
# Gist id lives in ~/.cache/claude-usage/gist-id (one line); the gist-only token in ~/.gh_gist.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
dir="$HOME/.cache/claude-usage"
export GH_TOKEN="$(tr -d '[:space:]' < "$HOME/.gh_gist")"
exec 9>"$dir/lock"; flock -n 9 || exit 0  # a slow run never overlaps the next one

numbers() { sed 's/"updated": [0-9]*, //' "$1" 2>/dev/null; }
end=$(( $(date +%s) + 50 ))
while [ "$(date +%s)" -lt "$end" ]; do
  if python3 "$(dirname "$0")/probe.py" > "$dir/new.json"; then
    age=$(( $(date +%s) - $(stat -c %Y "$dir/usage.json" 2>/dev/null || echo 0) ))
    if [ "$(numbers "$dir/new.json")" != "$(numbers "$dir/usage.json")" ] || [ "$age" -ge 300 ]; then
      gh gist edit "$(cat "$dir/gist-id")" --filename usage.json "$dir/new.json" &&
        mv "$dir/new.json" "$dir/usage.json" && echo "$(date +%T) pushed $(numbers "$dir/usage.json")"
    fi
  fi
  sleep 10
done
