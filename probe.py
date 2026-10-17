#!/usr/bin/env python3
"""Run `claude -p /usage`, print the limits as JSON. Regexes from github.com/Enhed/clawd-usage-winwidget (docs/PORTING.md).

Usage: probe.py            -> JSON on stdout (exit 1 if the probe failed, so cron keeps the old file)
       probe.py --test     -> self-check on sample output
"""
import json, re, subprocess, sys, time
from datetime import datetime
from zoneinfo import ZoneInfo

LINES = {
    "session": r"Current session:\s*(\d+)%(?:[^\n]*?resets\s*([^\n]+))?",
    "week":    r"Current week \(all models\):\s*(\d+)%(?:[^\n]*?resets\s*([^\n]+))?",
    "fable":   r"Current week \(Fable\):\s*(\d+)%(?:[^\n]*?resets\s*([^\n]+))?",
}
STAMP = r"([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)(?:\s*\(([^)]+)\))?"


def parse_reset(s, now):
    """'Oct 17, 3:29pm (Asia/Dhaka)' -> epoch ms. No year in the stamp: assume this one, roll over at New Year."""
    m = re.search(STAMP, s or "")
    if not m:
        return None
    mon, day, hour, minute, ampm, tz = m.groups()
    tz = ZoneInfo(tz) if tz else now.tzinfo
    dt = datetime.strptime(f"{mon} {day} {now.year} {hour}:{minute or '00'} {ampm.upper()}",
                           "%b %d %Y %I:%M %p").replace(tzinfo=tz)
    if (now - dt).days > 30:
        dt = dt.replace(year=dt.year + 1)
    return int(dt.timestamp() * 1000)


def parse(text, now):
    out = {"updated": int(now.timestamp() * 1000)}
    for key, rx in LINES.items():
        m = re.search(rx, text)
        if m:  # no "resets" means the window hasn't started: 0%, not missing
            out[key] = {"pct": int(m.group(1)), "reset": parse_reset(m.group(2), now)}
    return out


def test():
    now = datetime(2026, 10, 17, 12, 0, tzinfo=ZoneInfo("Asia/Dhaka"))
    sample = ("Current session: 46% used · resets Oct 17, 3:29pm (Asia/Dhaka)\n"
              "Current week (all models): 0% used\n"
              "Current week (Fable): 19% used · resets Jan 2, 6am (Europe/Moscow)\n")
    d = parse(sample, now)
    assert d["session"] == {"pct": 46, "reset": int(datetime(2026, 10, 17, 15, 29, tzinfo=ZoneInfo("Asia/Dhaka")).timestamp() * 1000)}
    assert d["week"] == {"pct": 0, "reset": None}
    assert datetime.fromtimestamp(d["fable"]["reset"] / 1000, ZoneInfo("Europe/Moscow")).year == 2027
    assert "fable" not in parse("Current session: 5% used", now)
    print("ok")


if __name__ == "__main__":
    if "--test" in sys.argv:
        test()
        sys.exit()
    # Argument array, not a shell string: some shells rewrite "/usage" into a path and it hits the model.
    r = subprocess.run(["claude", "-p", "/usage", "--output-format", "text", "--no-session-persistence"],
                       capture_output=True, text=True, timeout=60)
    data = parse(r.stdout, datetime.now().astimezone())
    if "session" not in data and "week" not in data:
        sys.exit(1)
    print(json.dumps(data))
