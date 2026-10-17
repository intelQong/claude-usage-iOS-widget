// Claude usage widget for Scriptable (iOS). Reads usage.json written by probe.py.
// Home Screen: a static Clawd whose pose follows the limits. Tap: fresh numbers and an animated Clawd.
// Widget parameter: the raw Gist URL of your usage.json
// (https://gist.githubusercontent.com/<user>/<gist id>/raw/usage.json).

// Remembered, because a tap runs the script in the app, where the widget parameter may not be passed.
const param = (args.widgetParameter || "").trim()
if (param) Keychain.set("claude-usage-url", param)
const URL = param || (Keychain.contains("claude-usage-url") ? Keychain.get("claude-usage-url") : "")
const BG = "#1a1a1a"
const fm = FileManager.local()
const cache = fm.joinPath(fm.documentsDirectory(), "claude-usage.json")

async function load() {
  if (!URL) { loadError = "set your raw Gist URL as the widget Parameter"; return null }
  try {
    const d = await new Request(URL + "?t=" + Date.now()).loadJSON()
    fm.writeString(cache, JSON.stringify(d))
    return d
  } catch (e) {
    // Offline or the Gist is down: keep the last numbers, they show as stale.
    loadError = String(e)
    return fm.fileExists(cache) ? JSON.parse(fm.readString(cache)) : null
  }
}
let loadError = ""

const color = p => p >= 85 ? Color.red() : p >= 60 ? Color.yellow() : Color.green()

// Clawd, ported from github.com/Enhed/clawd-usage-winwidget (lib/mascot.ps1): 9x3 glyphs, each glyph 2x4 pixels -> 18x12 grid.
// Returns [x, y, c] pixels, c = 1 body, 2 eye. Self-contained: its source is also injected into the tap page.
function clawdCells(f) {
  const Q = { " ": 0, "█": 15, "▀": 3, "▄": 12, "▌": 5, "▐": 10, "▘": 1, "▝": 2, "▖": 4, "▗": 8, "▛": 7, "▜": 11, "▙": 13, "▟": 14 }
  const ARMS = {
    down: [" ▐", "", "▝▜", "█▀"], up: ["▗▟", "▄", " ▜", "█▘"],
    right: [" ▐", "▄", "▝▜", "█▘"], left: ["▗▟", "", " ▜", "█▀"],
  }
  const FEET = { both: " ▝▝   ▝▝ ", left: " ▝▝      ", right: "      ▝▝ " }
  const EYES = {
    open: "1,2 1,3", left: "0,0 0,1", right: "2,0 2,1", closed: "0,3 1,3", wink: "1,2 1,3;0,3 1,3",
    happy: "0,3 1,2 2,3", focus: "1,3", wide: "0,1 1,1 0,2 1,2 0,3 1,3", x: "0,1 2,1 1,2 0,3 2,3",
  }
  const W = 18, H = 12, g = Array.from({ length: H }, () => Array(W).fill(0))
  const paint = (s, col, row) => [...s].forEach((ch, i) => {
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 2; sx++)
      if ((Q[ch] || 0) & ((sy < 2 ? 1 : 4) * (sx ? 2 : 1))) g[4 * row + sy][2 * (col + i) + sx] = 1
  })
  const a = ARMS[f.arms || "down"]
  paint(a[0], 0, 0); paint("██████", 2, 0); paint(a[1], 8, 0)
  paint(a[2], 0, 1); paint("█████", 2, 1); paint(a[3], 7, 1)
  paint(FEET[f.feet || "both"], 0, 2)
  const sh = EYES[f.eyes || "open"].split(";")
  ;[4, 12].forEach((ex, k) => sh[Math.min(k, sh.length - 1)].split(" ").forEach(p => {
    const [dx, dy] = p.split(",").map(Number)
    g[dy][ex + dx] = 2
  }))
  // off: rows lowered (1 = crouched, negative = above the frame), x: cells shifted, flip: belly-up.
  const out = [], oy = 4 * (f.off || 0), ox = 2 * (f.x || 0)
  for (let y = 0; y < H; y++) {
    let sy = y
    if (f.flip) { if (y >= H - 2) continue; sy = H - 3 - y }
    const yy = sy + oy
    if (yy < 0 || yy >= H) continue
    for (let x = 0; x < W; x++) if (g[y][x] && x + ox >= 0 && x + ox < W) out.push([x + ox, yy, g[y][x]])
  }
  return out
}

// dead: limit used up. sleep: window not started. fresh: window started < 15 min ago. idle: the rest.
function moodOf(s, now) {
  if (s.pct >= 100) return "dead"
  if (!s.reset) return "sleep"
  if (now - (s.reset - 5 * 3600e3) < 15 * 60e3) return "fresh"
  return "idle"
}

function widgetPose(s) {
  const mood = moodOf(s, Date.now())
  if (mood === "dead") return { eyes: "x", flip: true }
  if (mood === "sleep") return { eyes: "closed", off: 1 }
  if (mood === "fresh") return { eyes: "happy", arms: "up" }
  if (s.pct >= 85) return { eyes: "focus" }
  // A different pose at each refresh, so he looks alive over the day.
  const poses = [{}, { eyes: "left" }, { eyes: "right" }, { eyes: "wink" }, { eyes: "happy" },
    { arms: "up" }, { feet: "left" }, { eyes: "wide" }, { arms: "right" }]
  return poses[Math.floor(Math.random() * poses.length)]
}

// mono: Lock Screen look - iOS tints everything one color, so white body and see-through eyes.
function clawdImage(s, mono) {
  const px = 4, py = 4.4, top = 12  // terminal pixels are a bit taller than wide; top: room for z / sweat
  const f = widgetPose(s)
  const ctx = new DrawContext()
  ctx.opaque = false
  ctx.respectScreenScale = true
  ctx.size = new Size(18 * px, 12 * py + top)
  for (const [x, y, c] of clawdCells(f)) {
    if (mono && c === 2) continue
    ctx.setFillColor(mono ? Color.white() : new Color(c === 2 ? BG : "#D77757"))
    ctx.fillRect(new Rect(x * px, top + y * py, px + 0.3, py + 0.3))
  }
  if (f.eyes === "closed") {
    ctx.setTextColor(mono ? Color.white() : Color.gray()); ctx.setFont(Font.boldSystemFont(11))
    ctx.drawText("z", new Point(15 * px, 0))
  }
  if (s.pct >= 85 && !f.flip) {  // sweat drop near the limit
    ctx.setFillColor(mono ? Color.white() : new Color("#5AC8FA"))
    ctx.fillEllipse(new Rect(16 * px, 2, 5, 8))
  }
  return ctx.getImage()
}

function bar(pct, w, mono) {
  const ctx = new DrawContext()
  ctx.opaque = false
  ctx.respectScreenScale = true
  ctx.size = new Size(w, 8)
  const track = new Path(); track.addRoundedRect(new Rect(0, 0, w, 8), 4, 4)
  ctx.addPath(track); ctx.setFillColor(new Color("#ffffff", mono ? 0.3 : 0.15)); ctx.fillPath()
  const fill = new Path(); fill.addRoundedRect(new Rect(0, 0, Math.max(8, w * Math.min(pct, 100) / 100), 8), 4, 4)
  ctx.addPath(fill); ctx.setFillColor(mono ? Color.white() : color(pct)); ctx.fillPath()
  return ctx.getImage()
}

// Gauge ring for the round Lock Screen widget, filling clockwise from the top.
function ring(pct) {
  const ctx = new DrawContext()
  ctx.opaque = false
  ctx.respectScreenScale = true
  ctx.size = new Size(64, 64)
  ctx.setLineWidth(5)
  ctx.setStrokeColor(new Color("#ffffff", 0.3)); ctx.strokeEllipse(new Rect(4, 4, 56, 56))
  const p = new Path(), n = Math.round(Math.min(pct, 100) * 0.6)
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + 2 * Math.PI * i / 60, pt = new Point(32 + 28 * Math.cos(a), 32 + 28 * Math.sin(a))
    i ? p.addLine(pt) : p.move(pt)
  }
  ctx.addPath(p); ctx.setStrokeColor(Color.white()); ctx.strokePath()
  return ctx.getImage()
}

function lockWidget(data, fam) {
  const w = new ListWidget()
  const s = data && data.session
  if (fam === "accessoryInline") {  // the one line above the clock: text only
    w.addText(s ? "Claude " + s.pct + "%" + (data.week ? " · week " + data.week.pct + "%" : "") : "Claude —")
    return w
  }
  if (fam === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true
    if (s) w.backgroundImage = ring(s.pct)
    const t = w.addText(s ? s.pct + "%" : "—"); t.font = Font.boldRoundedSystemFont(15); t.centerAlignText()
    return w
  }
  // accessoryRectangular: Clawd + session %, bar, live countdown and week.
  if (!s) { w.addText("Claude: no data"); return w }
  const head = w.addStack(); head.centerAlignContent()
  const img = head.addImage(clawdImage(s, true)); img.imageSize = new Size(30, 26)
  head.addSpacer(6)
  const pct = head.addText(s.pct + "%"); pct.font = Font.boldRoundedSystemFont(22)
  head.addSpacer()
  if (data.week) { const wk = head.addText("W " + data.week.pct + "%"); wk.font = Font.semiboldSystemFont(12) }
  w.addSpacer(3)
  w.addImage(bar(s.pct, 150, true))
  w.addSpacer(3)
  if (s.reset) {
    const d = w.addDate(new Date(s.reset)); d.applyTimerStyle()
    d.font = Font.regularMonospacedSystemFont(12)
  }
  return w
}

function row(parent, label, lim, w) {
  const top = parent.addStack()
  const l = top.addText(label); l.font = Font.semiboldSystemFont(13); l.textColor = Color.gray()
  top.addSpacer()
  const p = top.addText(lim.pct + "%"); p.font = Font.boldSystemFont(13); p.textColor = color(lim.pct)
  parent.addSpacer(2)
  parent.addImage(bar(lim.pct, w))
}

function resets(parent, lim) {
  const s = parent.addStack()
  const t = s.addText("resets in "); t.font = Font.systemFont(13); t.textColor = Color.gray()
  if (!lim.reset) { const z = s.addText("—"); z.font = Font.systemFont(13); return }
  // Ticks live on the Home Screen without spending refresh budget.
  const d = s.addDate(new Date(lim.reset)); d.applyTimerStyle()
  d.font = Font.regularMonospacedSystemFont(13); d.textColor = Color.white()
}

// Tap page: the 60 ms frame sequences from mascot.ps1, idle acts at random, tap Clawd for one more.
function page(data) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  body { margin: 0; background: ${BG}; color: #fff; font: 15px -apple-system, system-ui; padding: 8px 22px 32px; -webkit-user-select: none }
  canvas { display: block; margin: 0 auto; width: 288px; height: 230px }
  .big { font: 700 72px ui-rounded, -apple-system, system-ui, sans-serif; text-align: center; line-height: 1 }
  .sub { color: #8e8e93; text-align: center; margin-top: 8px; font-variant-numeric: tabular-nums }
  .row { display: flex; justify-content: space-between; color: #8e8e93; font-weight: 600; font-size: 14px; margin-top: 24px }
  .bar { height: 10px; border-radius: 5px; background: rgba(255,255,255,.15); margin-top: 6px; overflow: hidden }
  .bar > i { display: block; height: 100%; border-radius: 5px }
  .hint { color: #636366; text-align: center; font-size: 12px; margin-top: 30px }
</style></head><body>
<canvas id="c" width="576" height="460"></canvas>
<div class="big" id="pct"></div>
<div class="bar"><i id="sbar"></i></div>
<div class="sub" id="reset"></div>
<div id="rows"></div>
<div class="hint" id="age"></div>
<script>
const DATA = ${JSON.stringify(data)}
${clawdCells.toString()}
${moodOf.toString()}
const col = p => p >= 85 ? "#ff453a" : p >= 60 ? "#ffd60a" : "#30d158"
const s = DATA.session, mood = moodOf(s, Date.now()), sweat = s.pct >= 85 && mood !== "dead"

// Numbers
const $ = id => document.getElementById(id)
$("pct").textContent = s.pct + "%"; $("pct").style.color = col(s.pct)
$("sbar").style.width = Math.max(2, Math.min(s.pct, 100)) + "%"; $("sbar").style.background = col(s.pct)
for (const [label, lim] of [["WEEK", DATA.week], ["FABLE · WEEK", DATA.fable]]) {
  if (!lim) continue
  const p = Number(lim.pct) || 0  // numbers only into the markup
  $("rows").insertAdjacentHTML("beforeend", '<div class="row"><span>' + label + '</span><span style="color:' +
    col(p) + '">' + p + '%</span></div><div class="bar"><i style="width:' + Math.max(2, Math.min(p, 100)) +
    '%;background:' + col(p) + '"></i></div>')
}
function clock() {
  const left = s.reset ? Math.max(0, s.reset - Date.now()) : 0, sec = Math.floor(left / 1000)
  const pad = n => String(n).padStart(2, "0")
  $("reset").textContent = s.reset ? "resets in " + Math.floor(sec / 3600) + ":" + pad(Math.floor(sec / 60) % 60) + ":" + pad(sec % 60) : "window not started"
  $("age").textContent = "updated " + Math.round((Date.now() - DATA.updated) / 1000) + "s ago · tap Clawd"
}
clock(); setInterval(clock, 1000)

// Frame sequences
const POSES = { default: "open/down/both", "arms-up": "open/up/both", "look-left": "left/down/both", "look-right": "right/down/both" }
const F = (pose, n = 1, o = {}) => {
  const [eyes, arms, feet] = (POSES[pose] || pose).split("/")
  return Array(n).fill(Object.assign({ eyes, arms, feet }, o))
}
const cr = [...F("default", 1, { off: 1, poof: "dot" }), ...F("default", 1, { off: 1, poof: "wave" })]
const bo = F("default"), ts = [...F("closed/down/both"), ...bo]
const jump = [...cr, ...F("arms-up", 3), ...bo, ...cr, ...F("arms-up", 3), ...bo]
let waddle = F("look-right", 1, { x: -9 })
for (let u = -6; u <= -1; u++) waddle.push(...F("right/down/" + (u % 2 === 0 ? "left" : "right"), 2, { x: u }))
const SEQ = {
  jump,
  look: [...F("look-right", 5), ...F("look-left", 5), ...bo],
  celebrate: [...jump, ...F("default", 3, { off: 1 })],
  skip: [...F("default", 1, { off: 1, x: -9 }), ...F("arms-up", 2, { x: -6 }), ...F("default", 1, { x: -6 }),
    ...F("default", 1, { off: 1, x: -6 }), ...F("arms-up", 2, { x: -3 }), ...F("default", 1, { x: -3 }),
    ...F("default", 1, { off: 1, x: -3 }), ...F("arms-up", 2), ...cr, ...bo],
  spin: [...F("look-left", 2), ...F("look-right", 2), ...F("look-left", 2), ...F("arms-up", 3), ...bo],
  peekaboo: [...F("default", 1, { off: 3 }), ...F("default", 3, { off: 2 }), ...F("look-right", 3, { off: 2 }),
    ...F("look-left", 3, { off: 2 }), ...F("default", 2, { off: 2 }), ...F("default", 1, { off: 1 }),
    ...F("arms-up", 4), ...F("default", 2), ...ts],
  drop: [...F("arms-up", 1, { off: -3 }), ...F("arms-up", 2, { off: -2 }), ...F("arms-up", 2, { off: -1 }),
    ...F("arms-up", 1), ...cr, ...F("default", 3), ...ts],
  waddle: [...waddle, ...F("look-right", 2), ...F("default", 2), ...ts],
  peek: [...F("look-right", 1, { x: -9 }), ...F("look-right", 5, { x: -6 }), ...F("look-right", 3, { x: -9 }),
    ...F("look-right", 4, { x: -5 }), ...F("arms-up", 2, { x: -3 }), ...F("arms-up", 2), ...cr, ...bo],
  wink: [...F("wink/down/both", 5), ...bo],
  boop: [...F("closed/down/both", 1, { off: 1, poof: "dot" }), ...F("closed/down/both", 2, { off: 1, poof: "wave" }),
    ...F("look-left", 4), ...F("default", 2), ...ts],
  tap: [...F("open/down/left", 2), ...F("open/down/right", 2), ...F("open/down/left", 2),
    ...F("open/down/right", 2), ...F("open/down/left", 1), ...F("open/down/right", 1), ...F("arms-up", 3), ...bo],
  sneeze: [...F("closed/up/both", 4), ...F("closed/down/both", 2, { off: 1, poof: "wave" }),
    ...F("closed/down/both", 2), ...F("default", 2), ...ts],
}
const IDLE = Object.keys(SEQ).filter(k => k !== "celebrate")
const CLICK = IDLE.filter(k => !SEQ[k][0].x)  // as in Claude Code: on tap only acts that start in place
const pick = a => a[Math.floor(Math.random() * a.length)]
const rnd = n => Math.floor(Math.random() * n)

// Animation: 60 ms frames like the terminal.
const c = $("c"), g = c.getContext("2d")
g.scale(2, 2)
const P = 12, PY = 13.2, OX = (288 - 18 * P) / 2, OY = 230 - 12 * PY - 8
const base = mood === "dead" ? { eyes: "x", flip: true } : mood === "sleep" ? { eyes: "closed", off: 1 }
  : { eyes: sweat ? "focus" : "open" }
let seq = mood === "fresh" ? SEQ.celebrate.slice() : [], t = 0, blinkAt = 30, nextAct = 50 + rnd(60)
const parts = []

function frame() {
  t++
  let f = base
  if (seq.length) f = seq.shift()
  else if (mood !== "dead" && mood !== "sleep") {
    if (t >= nextAct) { seq = SEQ[pick(IDLE)].slice(); nextAct = t + 80 + rnd(120) }
    else if (t >= blinkAt) { if (t < blinkAt + 2) f = Object.assign({}, base, { eyes: "closed" }); else blinkAt = t + 40 + rnd(60) }
  }
  if (mood === "sleep" && t % 22 === 0) parts.push({ k: "z", x: OX + 15 * P, y: OY, vx: 0.6, vy: -0.9, life: 45 })
  if (sweat && t % 28 === 0) parts.push({ k: "drop", x: OX + 16 * P, y: OY + 6, vx: 0.5, vy: 0.4, life: 30 })

  g.clearRect(0, 0, 288, 230)
  const body = mood === "dead" ? "#b0705a" : "#D77757"
  for (const [x, y, k] of clawdCells(f)) {
    g.fillStyle = k === 2 ? "${BG}" : body
    g.fillRect(OX + x * P, OY + y * PY, P + 0.5, PY + 0.5)
  }
  if (f.poof && f.off > 0) {  // dust at the sides while crouched
    g.fillStyle = "#8e8e93"
    const pts = f.poof === "dot" ? [[0.6, 9.4, 0.8, 0.9]] : [[0, 9.6, 0.7, 0.6], [0.7, 9.1, 0.6, 0.6], [1.3, 9.6, 0.7, 0.6]]
    for (const cx of [0, 16]) for (const [x, y, w, h] of pts) g.fillRect(OX + (cx + x) * P, OY + y * PY, w * P, h * PY)
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    p.x += p.vx; p.y += p.vy; p.life--
    if (p.life <= 0) { parts.splice(i, 1); continue }
    g.globalAlpha = Math.min(1, p.life / 15)
    if (p.k === "drop") { g.fillStyle = "#5AC8FA"; g.beginPath(); g.ellipse(p.x, p.y, 4, 6, 0, 0, 7); g.fill() }
    else { g.fillStyle = p.k === "z" ? "#8e8e93" : "#ff375f"; g.font = "bold 20px -apple-system"; g.fillText(p.k === "z" ? "z" : "♥", p.x, p.y) }
    g.globalAlpha = 1
  }
}
setInterval(frame, 60)

c.addEventListener("click", () => {
  parts.push({ k: "heart", x: OX + 8 * P, y: OY, vx: (Math.random() - 0.5) * 1.5, vy: -2, life: 30 })
  if (mood !== "dead" && mood !== "sleep") { seq = SEQ[pick(CLICK)].slice(); nextAct = t + 120 }
})
</script></body></html>`
}

const data = await load()

if (config.runsInApp && data && data.session) {
  // Tapped the widget (or ran in the app): fresh numbers plus the animated Clawd.
  const wv = new WebView()
  await wv.loadHTML(page(data))
  await wv.present(true)
}

const fam = config.widgetFamily || ""
const w = fam.startsWith("accessory") ? lockWidget(data, fam) : homeWidget(data)
w.refreshAfterDate = new Date(Date.now() + 5 * 60000)  // iOS treats this as a hint, not a promise
if (config.runsInWidget) Script.setWidget(w)
else if (!data || !data.session) await w.presentMedium()
Script.complete()

function homeWidget(data) {
  const w = new ListWidget()
  w.backgroundColor = new Color(BG)
  w.setPadding(12, 12, 12, 12)

  if (!data || !data.session) {
    const t = w.addText("No data: " + (loadError || "no session in JSON") + "\n" + URL)
    t.font = Font.systemFont(13); t.textColor = Color.white()
  } else {
    const s = data.session
    const big = config.widgetFamily === "medium"
    const barW = big ? 290 : 130

    const head = w.addStack(); head.centerAlignContent()
    const img = head.addImage(clawdImage(s)); img.imageSize = big ? new Size(70, 62) : new Size(50, 44)
    head.addSpacer()
    const pct = head.addText(s.pct + "%"); pct.font = Font.boldRoundedSystemFont(big ? 46 : 34); pct.textColor = color(s.pct)
    w.addSpacer(4)
    w.addImage(bar(s.pct, barW))
    w.addSpacer(3)
    resets(w, s)
    w.addSpacer()
    if (data.week) row(w, "WEEK", data.week, barW)
    if (big && data.fable) { w.addSpacer(4); row(w, "FABLE · WEEK", data.fable, barW) }

    const age = (Date.now() - data.updated) / 60000
    if (age > 20) {
      w.addSpacer(2)
      const st = w.addText("stale · " + Math.round(age) + "m old"); st.font = Font.systemFont(11); st.textColor = Color.orange()
    }
  }
  return w
}
