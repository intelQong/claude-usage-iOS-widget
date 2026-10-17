# claude-limit-iOS-widget

Your Claude plan limits on the iPhone Home Screen and Lock Screen: the same numbers as `/usage` in
Claude Code, with a pixel Clawd who reacts to them. Tap the widget for fresh numbers and an animated Clawd.

An iOS port of [clawd-usage-winwidget](https://github.com/Enhed/clawd-usage-winwidget).

> Unofficial. Not affiliated with or endorsed by Anthropic.

## How it works

```
Linux box with Claude Code (always on)          iPhone (any network)
cron every minute                                Scriptable widget
  claude -p /usage  → probe.py → usage.json  →  secret Gist  →  fetches usage.json, draws Clawd
```

- **No tokens spent.** `claude -p /usage` asks Anthropic's servers for your limit numbers and never calls
  the model (`total_cost_usd: 0`, `num_turns: 0`). No API key needed, it uses your Claude Code login.
- **No Mac needed.** The widget runs in the free [Scriptable](https://scriptable.app) app.
- The box checks about every 15 s and uploads only when the numbers change (plus every 5 min, so the widget
  can tell fresh data from stale).

## Setup: the always-on box

Needs Linux with [Claude Code](https://docs.claude.com/en/docs/claude-code) logged in, Python 3.9+,
and the [GitHub CLI](https://cli.github.com) (`gh`).

1. Clone the repo and check the probe works:
   ```sh
   git clone https://github.com/intelQong/claude-limit-iOS-widget.git ~/claude-limit-iOS-widget
   cd ~/claude-limit-iOS-widget
   python3 probe.py --test && python3 probe.py
   ```
2. Make a GitHub token that can only edit Gists: github.com → Settings → Developer settings →
   Personal access tokens → **Tokens (classic)**, tick only **`gist`**. Save it on the box:
   ```sh
   nano ~/.gh_gist && chmod 600 ~/.gh_gist
   ```
3. Create the secret Gist and remember its id:
   ```sh
   mkdir -p ~/.cache/claude-usage
   python3 probe.py > ~/.cache/claude-usage/usage.json
   GH_TOKEN=$(cat ~/.gh_gist) gh gist create ~/.cache/claude-usage/usage.json -d "claude usage"
   # prints https://gist.github.com/<user>/<gist id>
   echo <gist id> > ~/.cache/claude-usage/gist-id
   ```
4. Run it every minute (`crontab -e`):
   ```
   * * * * * $HOME/claude-limit-iOS-widget/publish.sh > $HOME/.cache/claude-usage/publish.log 2>&1
   ```

Cron runs it in the background: no window, no terminal, nothing added to your Claude Code sessions.

## Setup: the iPhone

1. Install **Scriptable**, tap **+**, paste in [`widget.js`](widget.js) and name it *Claude Usage*.
2. Add a Scriptable widget to the Home Screen (small or medium) or the Lock Screen (inline, round or
   rectangular). Long-press it → **Edit Widget** → Script: *Claude Usage* → **Parameter**:
   ```
   https://gist.githubusercontent.com/<user>/<gist id>/raw/usage.json
   ```
   Every widget needs the Parameter once; after that the script remembers it.
3. Set **When Interacting** to **Run Script**, so a tap opens the animated view.

## What it shows

- **Home Screen:** session (5-hour window) %, bar, live reset countdown, weekly limit, and the weekly
  Fable limit on the medium size. Bars go yellow at 60 % and red at 85 %.
- **Lock Screen:** a session % ring, a one-line summary, or Clawd with %, bar and countdown.
- **Clawd's mood:** asleep before the window starts, arms up right after a reset, a random pose otherwise,
  sweating from 85 %, belly-up at 100 %.
- **Tap:** fresh numbers and Clawd animated at 60 ms per frame (blinks, jumps, spins, peekaboo…).
  Tap him for a heart.

iOS decides when widgets redraw (roughly every 5–15 min), so the Home Screen lags a little; the countdown
ticks live and a tap always fetches the latest numbers.

## Privacy

A secret Gist is unlisted but not private: anyone with the link can read it. It holds only percentages and
reset times, no email, account or prompts. Don't share your Gist link. The token is limited to Gists.

## Files

| file | what |
|---|---|
| `probe.py` | runs `claude -p /usage`, prints the limits as JSON (`--test` for the self-check) |
| `publish.sh` | cron entry point: probe, upload to the Gist on change |
| `widget.js` | the Scriptable widget, Lock Screen widgets and the animated tap view |

## Credits

Clawd's sprites, animations and the `/usage` parsing rules come from
[clawd-usage-winwidget](https://github.com/Enhed/clawd-usage-winwidget) by Venger Sergey (MIT).
Clawd is the mascot from Claude Code's welcome screen.

## License

[MIT](LICENSE)
