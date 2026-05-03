const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== DB =====
mongoose.connect(process.env.MONGO_URI);

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  score: { type: Number, default: 0 }
});
const User = mongoose.model("User", userSchema);

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "xo-secret-2025",
  resave: false,
  saveUninitialized: false
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// ===== ROOMS =====
let rooms = {};

// ===== AUTH ROUTES =====
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ ok: false, msg: "Please fill in all fields" });
    const exists = await User.findOne({ username });
    if (exists) return res.json({ ok: false, msg: "ชื่อนี้ถูกใช้แล้ว" });
    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, password: hash });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, msg: "An error occurred" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.json({ ok: false, msg: "User not found" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ ok: false, msg: "Incorrect password!" });
    req.session.user = username;
    res.json({ ok: true, username });
  } catch (e) {
    res.json({ ok: false, msg: "An error occurred!" });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get("/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

// ===== SERVE HTML =====
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>XO ARENA</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    :root {
      --x: #00f5ff;
      --o: #ff6b35;
      --gold: #ffd700;
      --bg: #020810;
      --surf: #080f1a;
      --surf2: #0d1825;
      --border: #152030;
      --text: #c8d8e8;
      --dim: #3a5a7a;
    }

    * { margin:0; padding:0; box-sizing:border-box; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Share Tech Mono', monospace;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
    }

    /* grid bg */
    body::before {
      content:'';
      position:fixed; inset:0;
      background-image:
        linear-gradient(rgba(0,245,255,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,245,255,0.025) 1px, transparent 1px);
      background-size: 48px 48px;
      animation: gridScroll 25s linear infinite;
      pointer-events:none; z-index:0;
    }
    @keyframes gridScroll {
      from { background-position: 0 0; }
      to   { background-position: 48px 48px; }
    }

    /* ── PAGES ── */
    .page { display:none; position:relative; z-index:1; width:100%; }
    .page.active { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; padding:24px; }

    /* ── LOGO ── */
    .logo {
      font-family:'Orbitron',sans-serif;
      font-size:clamp(1.6rem,5vw,2.8rem);
      font-weight:900;
      letter-spacing:8px;
      color: var(--x);
      text-shadow: 0 0 20px var(--x), 0 0 50px rgba(0,245,255,0.3);
      margin-bottom:8px;
      animation: logoPulse 3s ease-in-out infinite;
    }
    @keyframes logoPulse {
      0%,100% { text-shadow: 0 0 20px var(--x), 0 0 50px rgba(0,245,255,0.3); }
      50%      { text-shadow: 0 0 35px var(--x), 0 0 80px rgba(0,245,255,0.5); }
    }

    .tagline { color:var(--dim); font-size:0.75rem; letter-spacing:4px; margin-bottom:40px; }

    /* ── CARD ── */
    .card {
      background: var(--surf);
      border: 1px solid var(--border);
      border-radius:12px;
      padding:32px;
      width:100%;
      max-width:380px;
      box-shadow: 0 0 40px rgba(0,245,255,0.04);
    }

    .card-title {
      font-family:'Orbitron',sans-serif;
      font-size:0.85rem;
      letter-spacing:4px;
      color:var(--dim);
      margin-bottom:24px;
      text-align:center;
    }

    /* ── INPUTS ── */
    .field { margin-bottom:16px; }
    .field label { display:block; font-size:0.72rem; letter-spacing:2px; color:var(--dim); margin-bottom:6px; }
    .field input {
      width:100%;
      background:var(--surf2);
      border:1px solid var(--border);
      color:var(--x);
      padding:10px 14px;
      font-family:'Share Tech Mono',monospace;
      font-size:0.9rem;
      border-radius:6px;
      outline:none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .field input:focus { border-color:var(--x); box-shadow:0 0 12px rgba(0,245,255,0.15); }

    /* ── BUTTONS ── */
    .btn {
      width:100%;
      background:transparent;
      border:1px solid var(--x);
      color:var(--x);
      padding:11px;
      font-family:'Orbitron',sans-serif;
      font-size:0.72rem;
      letter-spacing:3px;
      cursor:pointer;
      border-radius:6px;
      transition:all 0.2s;
      text-transform:uppercase;
      margin-top:8px;
    }
    .btn:hover { background:rgba(0,245,255,0.08); box-shadow:0 0 18px rgba(0,245,255,0.25); }
    .btn.o { border-color:var(--o); color:var(--o); }
    .btn.o:hover { background:rgba(255,107,53,0.08); box-shadow:0 0 18px rgba(255,107,53,0.25); }
    .btn.gold { border-color:var(--gold); color:var(--gold); }
    .btn.gold:hover { background:rgba(255,215,0,0.08); box-shadow:0 0 18px rgba(255,215,0,0.25); }
    .btn.sm { width:auto; padding:8px 18px; font-size:0.65rem; }

    .msg { text-align:center; font-size:0.78rem; min-height:20px; margin-top:10px; }
    .msg.err { color:#ff4444; }
    .msg.ok  { color:#44ff88; }

    .switch-link {
      text-align:center; margin-top:16px; font-size:0.75rem; color:var(--dim);
    }
    .switch-link span { color:var(--x); cursor:pointer; }
    .switch-link span:hover { text-decoration:underline; }

    /* ── MODE SELECT ── */
    .mode-grid {
      display:grid; grid-template-columns: repeat(3,1fr); gap:16px;
      width:100%; max-width:600px; margin:24px 0;
    }

    .mode-card {
      background:var(--surf);
      border:1px solid var(--border);
      border-radius:10px;
      padding:24px 16px;
      cursor:pointer;
      text-align:center;
      transition:all 0.25s;
      position:relative;
      overflow:hidden;
    }
    .mode-card::before {
      content:'';
      position:absolute; inset:0;
      background: linear-gradient(135deg, rgba(0,245,255,0.03), transparent);
      opacity:0; transition:opacity 0.2s;
    }
    .mode-card:hover { border-color:var(--x); transform:translateY(-4px); box-shadow:0 8px 30px rgba(0,245,255,0.1); }
    .mode-card:hover::before { opacity:1; }

    .mode-size {
      font-family:'Orbitron',sans-serif;
      font-size:1.8rem; font-weight:900;
      color:var(--x);
      text-shadow:0 0 15px rgba(0,245,255,0.5);
      margin-bottom:8px;
    }
    .mode-label { font-size:0.7rem; letter-spacing:2px; color:var(--dim); }
    .mode-win   { font-size:0.65rem; color:#2a6a8a; margin-top:6px; }

    /* ── LOBBY ── */
    .lobby-info {
      display:flex; align-items:center; gap:16px;
      margin-bottom:20px; flex-wrap:wrap; justify-content:center;
    }
    .chip {
      background:var(--surf2); border:1px solid var(--border);
      padding:6px 14px; border-radius:20px; font-size:0.75rem;
      color:var(--dim);
    }
    .chip span { color:var(--x); }

    /* ── BOARD WRAPPER ── */
    #boardWrapper {
      overflow:auto;
      max-width:min(95vw, 700px);
      max-height:70vh;
      padding:4px;
    }

    #board {
      display:inline-grid;
      gap:4px;
      background:var(--border);
      padding:4px;
      border-radius:8px;
      box-shadow:0 0 30px rgba(0,245,255,0.05);
    }

    .cell {
      background:var(--surf2);
      display:flex; align-items:center; justify-content:center;
      font-family:'Orbitron',sans-serif; font-weight:900;
      cursor:pointer;
      border-radius:4px;
      border:1px solid transparent;
      transition:all 0.15s;
      user-select:none;
    }
    .cell:hover:not(.taken) {
      background:#0f1e2e; border-color:rgba(0,245,255,0.15);
      transform:scale(1.06);
    }
    .cell.taken { cursor:default; }
    .cell.pop { animation: cellPop 0.25s cubic-bezier(0.34,1.56,0.64,1); }
    @keyframes cellPop {
      0%   { transform:scale(0.4); opacity:0.3; }
      100% { transform:scale(1);   opacity:1; }
    }
    .cell.win-cell {
      animation: winPulse 0.5s ease-in-out infinite alternate !important;
      border-color:var(--gold) !important;
      background:rgba(255,215,0,0.07) !important;
    }
    @keyframes winPulse {
      from { transform:scale(1);    box-shadow:0 0 8px var(--gold); }
      to   { transform:scale(1.1);  box-shadow:0 0 24px var(--gold), 0 0 48px rgba(255,215,0,0.3); }
    }

    /* ── STATUS ── */
    #status {
      font-size:0.8rem; letter-spacing:3px; color:var(--dim);
      min-height:20px; text-align:center; margin:12px 0;
    }

    /* ── EXPAND PANEL ── */
    #expandPanel {
      background:var(--surf);
      border:1px solid var(--o);
      border-radius:10px;
      padding:20px 24px;
      text-align:center;
      margin-top:16px;
      animation: fadeSlideIn 0.3s ease;
    }
    @keyframes fadeSlideIn {
      from { opacity:0; transform:translateY(10px); }
      to   { opacity:1; transform:translateY(0); }
    }
    .expand-title {
      font-family:'Orbitron',sans-serif;
      font-size:0.75rem; letter-spacing:3px;
      color:var(--o); margin-bottom:14px;
    }
    .expand-btns { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }

    /* ── SCOREBOARD ── */
    #scoreBoard {
      background:var(--surf2); border:1px solid var(--border);
      border-radius:8px; padding:12px 20px;
      font-size:0.8rem; line-height:2;
      min-width:180px; text-align:center;
      color:var(--dim); margin-top:12px;
    }

    /* ── TOPBAR ── */
    .topbar {
      position:fixed; top:0; left:0; right:0;
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 20px;
      background:rgba(2,8,16,0.85);
      backdrop-filter:blur(8px);
      border-bottom:1px solid var(--border);
      z-index:10;
    }
    .topbar-user { font-size:0.75rem; color:var(--dim); }
    .topbar-user span { color:var(--x); }

    /* ════════════════════════════
       OVERLAYS
    ════════════════════════════ */
    .overlay {
      position:fixed; inset:0;
      background:rgba(0,0,0,0.8);
      backdrop-filter:blur(8px);
      display:flex; align-items:center; justify-content:center;
      z-index:999;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }

    .win-box {
      position:relative;
      display:flex; flex-direction:column; align-items:center; gap:10px;
      animation: popIn 0.45s cubic-bezier(0.34,1.56,0.64,1);
    }
    @keyframes popIn {
      0%   { transform:scale(0.2) rotate(-10deg); opacity:0; }
      100% { transform:scale(1)   rotate(0deg);   opacity:1; }
    }
    .win-symbol {
      font-family:'Orbitron',sans-serif;
      font-size:6rem; font-weight:900; line-height:1;
      animation: spinIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
    }
    @keyframes spinIn {
      0%   { transform:rotateY(90deg) scale(0.5); }
      100% { transform:rotateY(0) scale(1); }
    }
    .win-label {
      font-family:'Orbitron',sans-serif;
      font-size:1.8rem; font-weight:700; letter-spacing:8px;
      color:#fff; text-shadow:0 0 20px var(--gold), 0 0 50px rgba(255,215,0,0.4);
    }
    .win-sub { font-size:0.7rem; letter-spacing:3px; color:rgba(255,255,255,0.35); }

    .particles { position:absolute; inset:-80px; pointer-events:none; }
    .particle {
      position:absolute; width:5px; height:5px; border-radius:50%;
      animation: pFly var(--dur) ease-out var(--delay) both;
    }
    @keyframes pFly {
      0%   { transform:translate(0,0) scale(1); opacity:1; }
      100% { transform:translate(var(--tx),var(--ty)) scale(0); opacity:0; }
    }

    .draw-box {
      font-family:'Orbitron',sans-serif;
      font-size:2.5rem; font-weight:700; letter-spacing:6px;
      color:rgba(255,255,255,0.4);
      animation: popIn 0.45s cubic-bezier(0.34,1.56,0.64,1);
    }

    /* ── GAME CONTROLS ── */
    .game-controls {
      display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-top:12px;
    }
  </style>
</head>
<body>

<!-- TOPBAR (hidden until logged in) -->
<div class="topbar" id="topbar" style="display:none">
  <div class="topbar-user">Player: <span id="topbarUser"></span></div>
  <button class="btn sm o" onclick="logout()">LOGOUT</button>
</div>

<!-- ════ PAGE: LOGIN / REGISTER ════ -->
<div class="page active" id="pageAuth">
  <div class="logo">XO ARENA</div>
  <div class="tagline">MULTIPLAYER · REAL-TIME · STRATEGY</div>

  <!-- LOGIN FORM -->
  <div class="card" id="loginCard">
    <div class="card-title">— SIGN IN —</div>
    <div class="field"><label>USERNAME</label><input id="loginUser" placeholder="your_name"/></div>
    <div class="field"><label>PASSWORD</label><input id="loginPass" type="password" placeholder="••••••"/></div>
    <button class="btn" onclick="doLogin()">ENTER ARENA</button>
    <div class="msg" id="loginMsg"></div>
    <div class="switch-link">Don’t have an account? <span onclick="showRegister()">Sign up</span></div>
  </div>

  <!-- REGISTER FORM -->
  <div class="card" id="registerCard" style="display:none">
    <div class="card-title">— REGISTER —</div>
    <div class="field"><label>USERNAME</label><input id="regUser" placeholder="your_name"/></div>
    <div class="field"><label>PASSWORD</label><input id="regPass" type="password" placeholder="••••••"/></div>
    <div class="field"><label>CONFIRM PASSWORD</label><input id="regPass2" type="password" placeholder="••••••"/></div>
    <button class="btn" onclick="doRegister()">CREATE ACCOUNT</button>
    <div class="msg" id="regMsg"></div>
    <div class="switch-link">มีบัญชีแล้ว? <span onclick="showLogin()">เข้าสู่ระบบ</span></div>
  </div>
</div>

<!-- ════ PAGE: MODE SELECT ════ -->
<div class="page" id="pageMode" style="padding-top:64px">
  <div class="logo">XO ARENA</div>
  <div class="tagline">SELECT YOUR BATTLEFIELD</div>

  <div class="mode-grid">
    <div class="mode-card" onclick="selectMode(3,3)">
      <div class="mode-size">3×3</div>
      <div class="mode-label">CLASSIC</div>
      <div class="mode-win">ชนะ 3 แถว</div>
    </div>
    <div class="mode-card" onclick="selectMode(9,5)">
      <div class="mode-size">9×9</div>
      <div class="mode-label">ADVANCED</div>
      <div class="mode-win">ชนะ 5 แถว</div>
    </div>
    <div class="mode-card" onclick="selectMode(16,5)">
      <div class="mode-size">16×16</div>
      <div class="mode-label">EPIC</div>
      <div class="mode-win">ชนะ 5 แถว</div>
    </div>
  </div>

  <div class="card" style="max-width:320px">
    <div class="card-title">— JOIN ROOM —</div>
    <div class="field"><label>ROOM ID</label><input id="roomInput" placeholder="ใส่ชื่อห้อง"/></div>
    <button class="btn" id="joinBtn" onclick="joinRoom()" disabled>JOIN / CREATE ROOM</button>
    <div class="msg" id="modeMsg"></div>
  </div>

  <div id="scoreBoard">🏆 LEADERBOARD<br><span style="color:var(--dim)">loading...</span></div>
</div>

<!-- ════ PAGE: GAME ════ -->
<div class="page" id="pageGame" style="padding-top:64px">

  <div class="lobby-info">
    <div class="chip">Room: <span id="roomLabel"></span></div>
    <div class="chip">>Mode: <span id="modeLabel"></span></div>
    <div class="chip">You’re: <span id="symbolLabel"></span></div>
  </div>

  <div id="status">WAITING FOR OPPONENT...</div>

  <div id="boardWrapper">
    <div id="board"></div>
  </div>

  <div id="expandPanel" style="display:none">
    <div class="expand-title">⚠ BOARD FULL — CHOOSE EXPANSION DIRECTION</div>
    <div class="expand-btns" id="expandBtns"></div>
  </div>

  <div class="game-controls">
    <button class="btn sm o" onclick="goBack()">← BACK</button>
    <button class="btn sm gold" onclick="restartGame()">RESTART</button>
  </div>

  <div id="scoreBoard2" style="margin-top:12px; background:var(--surf2); border:1px solid var(--border); border-radius:8px; padding:12px 20px; font-size:0.8rem; line-height:2; min-width:180px; text-align:center; color:var(--dim);">
    🏆 LEADERBOARD
  </div>
</div>

<script>
const socket = io();

// ── STATE ──
let myUser = null;
let mySymbol = "";
let room = "";
let boardSize = 3;
let winLen = 3;
let board = [];
let current = "X";
let gameOver = false;
let waitingExpand = false;

// ── ON LOAD ──
window.onload = async () => {
  const r = await fetch("/me");
  const d = await r.json();
  if (d.user) {
    myUser = d.user;
    showPage("pageMode");
    setTopbar(myUser);
    loadLeaderboard();
  }
};

// ── AUTH ──
function showLogin()    { document.getElementById("loginCard").style.display=""; document.getElementById("registerCard").style.display="none"; }
function showRegister() { document.getElementById("loginCard").style.display="none"; document.getElementById("registerCard").style.display=""; }

async function doLogin() {
  const username = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value;
  const msg = document.getElementById("loginMsg");
  if (!username||!password) return setMsg(msg,"Please fill in all fields","err");
  const r = await fetch("/login",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username,password}) });
  const d = await r.json();
  if (d.ok) {
    myUser = d.username;
    showPage("pageMode");
    setTopbar(myUser);
    loadLeaderboard();
  } else {
    setMsg(msg, d.msg, "err");
  }
}

async function doRegister() {
  const username = document.getElementById("regUser").value.trim();
  const password = document.getElementById("regPass").value;
  const password2 = document.getElementById("regPass2").value;
  const msg = document.getElementById("regMsg");
  if (!username||!password) return setMsg(msg,"Please fill in all fields","err");
  if (password !== password2) return setMsg(msg,"Passwords do not match","err");
  const r = await fetch("/register",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username,password}) });
  const d = await r.json();
  if (d.ok) {
    setMsg(msg,"Registration successful! You can now log in","ok");
    setTimeout(showLogin, 1500);
  } else {
    setMsg(msg, d.msg, "err");
  }
}

async function logout() {
  await fetch("/logout",{method:"POST"});
  myUser = null; mySymbol = ""; room = "";
  document.getElementById("topbar").style.display = "none";
  showPage("pageAuth");
}

// ── MODE SELECT ──
let selectedSize = 0;
let selectedWin  = 0;

function selectMode(size, win) {
  selectedSize = size;
  selectedWin  = win;
  document.querySelectorAll(".mode-card").forEach(c => c.style.borderColor = "");
  event.currentTarget.style.borderColor = "var(--x)";
  document.getElementById("joinBtn").disabled = false;
  setMsg(document.getElementById("modeMsg"), \`Select \${size}×\${size} — Win \${win} Row\`, "ok");
}

function joinRoom() {
  room = document.getElementById("roomInput").value.trim();
  if (!room) return setMsg(document.getElementById("modeMsg"),"Enter a room name","err");
  boardSize = selectedSize;
  winLen    = selectedWin;
  socket.emit("joinRoom", { room, boardSize, winLen, username: myUser });
}

// ── RESTART ──
function restartGame() {
  socket.emit("restart", room);
}

function goBack() {
  socket.emit("leaveRoom", room);
  room = "";
  showPage("pageMode");
  loadLeaderboard();
}

// ── SOCKET EVENTS ──
socket.on("start", (data) => {
  mySymbol  = data.symbol;
  boardSize = data.boardSize;
  winLen    = data.winLen;
  board     = Array(boardSize * boardSize).fill("");
  current   = "X";
  gameOver  = false;
  waitingExpand = false;

  document.getElementById("roomLabel").textContent   = room;
  document.getElementById("modeLabel").textContent   = \`\${boardSize}×\${boardSize}\`;
  document.getElementById("symbolLabel").textContent = mySymbol;
  document.getElementById("symbolLabel").style.color = mySymbol==="X"?"var(--x)":"var(--o)";

  showPage("pageGame");
  document.getElementById("expandPanel").style.display = "none";
  setStatus("YOUR TURN");
  draw();
});

socket.on("play", (d) => {
  board[d.i] = d.s;
  current = d.s === "X" ? "O" : "X";
  drawWithPop(d.i);
  check();
  if (!gameOver) setStatus("YOUR TURN");
});

socket.on("expand", (data) => {
  board     = data.board;
  boardSize = data.boardSize;
  current   = data.current;
  gameOver  = false;
  waitingExpand = false;
  document.getElementById("expandPanel").style.display = "none";
  document.getElementById("modeLabel").textContent = \`\${boardSize}×\${boardSize}\`;
  draw();
  setStatus(current === mySymbol ? "YOUR TURN" : "OPPONENT'S TURN");
});

socket.on("restart", () => {
  board    = Array(boardSize * boardSize).fill("");
  current  = "X";
  gameOver = false;
  waitingExpand = false;
  document.getElementById("expandPanel").style.display = "none";
  document.getElementById("winOverlay")?.remove();
  document.getElementById("drawOverlay")?.remove();
  setStatus("YOUR TURN");
  draw();
});

socket.on("score", (list) => {
  updateLeaderboard(list);
});

// ── PLAY ──
function play(i) {
  if (board[i] || current !== mySymbol || gameOver || waitingExpand) return;
  board[i] = mySymbol;
  socket.emit("play", { room, i, s: mySymbol });
  drawWithPop(i);
  check();
  if (!gameOver) setStatus("OPPONENT'S TURN");
}

// ── DRAW ──
function draw() {
  const el = document.getElementById("board");
  const cellSize = boardSize <= 3 ? 96 : boardSize <= 9 ? 60 : 40;
  const fontSize = boardSize <= 3 ? "2.4rem" : boardSize <= 9 ? "1.4rem" : "0.9rem";
  el.style.gridTemplateColumns = \`repeat(\${boardSize}, \${cellSize}px)\`;
  el.style.gridTemplateRows    = \`repeat(\${boardSize}, \${cellSize}px)\`;

  let html = "";
  for (let i = 0; i < boardSize * boardSize; i++) {
    const sym   = board[i];
    const color = sym==="X" ? "var(--x)" : sym==="O" ? "var(--o)" : "transparent";
    const taken = sym ? " taken" : "";
    html += \`<div class="cell\${taken}" style="width:\${cellSize}px;height:\${cellSize}px;font-size:\${fontSize};color:\${color}" onclick="play(\${i})">\${sym}</div>\`;
  }
  el.innerHTML = html;
}

function drawWithPop(idx) {
  draw();
  const cells = document.querySelectorAll(".cell");
  if (cells[idx]) {
    cells[idx].classList.add("pop");
    cells[idx].addEventListener("animationend", () => cells[idx].classList.remove("pop"), { once:true });
  }
}

// ── CHECK WIN ──
function check() {
  const size = boardSize;
  const win  = winLen;

  const lines = [];
  // rows
  for (let r=0; r<size; r++) {
    for (let c=0; c<=size-win; c++) {
      const line = [];
      for (let k=0; k<win; k++) line.push(r*size+c+k);
      lines.push(line);
    }
  }
  // cols
  for (let c=0; c<size; c++) {
    for (let r=0; r<=size-win; r++) {
      const line = [];
      for (let k=0; k<win; k++) line.push((r+k)*size+c);
      lines.push(line);
    }
  }
  // diag \\
  for (let r=0; r<=size-win; r++) {
    for (let c=0; c<=size-win; c++) {
      const line = [];
      for (let k=0; k<win; k++) line.push((r+k)*size+(c+k));
      lines.push(line);
    }
  }
  // diag /
  for (let r=0; r<=size-win; r++) {
    for (let c=win-1; c<size; c++) {
      const line = [];
      for (let k=0; k<win; k++) line.push((r+k)*size+(c-k));
      lines.push(line);
    }
  }

  for (const line of lines) {
    const first = board[line[0]];
    if (first && line.every(i => board[i] === first)) {
      gameOver = true;
      highlightWin(line);
      setTimeout(() => showWinOverlay(first), 400);
      socket.emit("win", room);
      return;
    }
  }

  // Board full?
  if (!board.includes("")) {
    if (current === mySymbol) {
      // Only the current player shows expand panel
      waitingExpand = true;
      gameOver = false;
      showExpandPanel();
    } else {
      waitingExpand = true;
      gameOver = false;
      setStatus("OPPONENT IS CHOOSING EXPANSION...");
    }
  }
}

// ── EXPAND ──
function showExpandPanel() {
  const panel = document.getElementById("expandPanel");
  const btns  = document.getElementById("expandBtns");
  panel.style.display = "";

  const directions = [
    { label:"↑ Expand top",    dir:"top"    },
    { label:"↓ Expand bottom", dir:"bottom" },
    { label:"← Expand left",   dir:"left"   },
    { label:"→ Expand right",  dir:"right"  },
    { label:"↕↔ Expand all sides", dir:"all" },
  ];

  btns.innerHTML = directions.map(d =>
    \`<button class="btn sm gold" onclick="expand('\${d.dir}')">\${d.label}</button>\`
  ).join("");

  setStatus("Choose a direction to expand the board");
}

function expand(dir) {
  socket.emit("expand", { room, dir, boardSize, board });
  document.getElementById("expandPanel").style.display = "none";
  setStatus("EXPANDING...");
}

// ── WIN HIGHLIGHT ──
function highlightWin(combo) {
  const cells = document.querySelectorAll(".cell");
  combo.forEach(i => {
    cells[i]?.classList.add("win-cell");
    if (cells[i]) cells[i].onclick = null;
  });
}

// ── WIN OVERLAY ──
function showWinOverlay(winner) {
  const color = winner==="X" ? "var(--x)" : "var(--o)";
  const glow  = winner==="X" ? "#00f5ff"  : "#ff6b35";
  const ov = document.createElement("div");
  ov.className = "overlay"; ov.id = "winOverlay";
  ov.innerHTML = \`
    <div class="win-box">
      <div class="particles" id="pCont"></div>
      <div class="win-symbol" style="color:\${color};text-shadow:0 0 30px \${glow},0 0 60px \${glow}40">\${winner}</div>
      <div class="win-label">WINS!</div>
      <div class="win-sub">PRESS RESTART TO PLAY AGAIN</div>
    </div>\`;
  document.body.appendChild(ov);
  spawnParticles(glow);
  setTimeout(() => ov?.remove(), 4500);
}

function spawnParticles(color) {
  const c = document.getElementById("pCont");
  if (!c) return;
  const colors = [color,"#fff","#ffd700",color+"99"];
  for (let i=0; i<30; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const angle = Math.random()*Math.PI*2;
    const dist  = 80+Math.random()*130;
    p.style.cssText = \`left:50%;top:50%;background:\${colors[i%4]};--tx:\${Math.cos(angle)*dist}px;--ty:\${Math.sin(angle)*dist}px;--dur:\${0.6+Math.random()*0.9}s;--delay:\${Math.random()*0.35}s;box-shadow:0 0 6px \${color}\`;
    c.appendChild(p);
  }
}

function showDrawOverlay() {
  const ov = document.createElement("div");
  ov.className = "overlay"; ov.id = "drawOverlay";
  ov.innerHTML = \`<div class="draw-box">DRAW</div>\`;
  document.body.appendChild(ov);
  setTimeout(() => ov?.remove(), 3000);
}

// ── LEADERBOARD ──
async function loadLeaderboard() {
  socket.emit("getScore");
}

function updateLeaderboard(list) {
  const html = "🏆 LEADERBOARD<br>" + list.map((u,i) =>
    \`<span style="color:var(--x)">#\${i+1} \${u.username}</span> : \${u.score}\`
  ).join("<br>");
  ["scoreBoard","scoreBoard2"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

// ── HELPERS ──
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function setTopbar(username) {
  document.getElementById("topbar").style.display = "flex";
  document.getElementById("topbarUser").textContent = username;
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function setMsg(el, msg, type) {
  el.textContent = msg;
  el.className = "msg " + type;
}
</script>
</body>
</html>`);
});

// ===== SOCKET =====
io.on("connection", (socket) => {

  socket.on("joinRoom", ({ room, boardSize, winLen, username }) => {
    socket.join(room);
    socket.data.username = username;
    socket.data.room = room;

    if (!rooms[room]) {
      rooms[room] = { players: [], boardSize, winLen, board: Array(boardSize*boardSize).fill(""), current: "X" };
    }

    const r = rooms[room];
    if (r.players.length >= 2) return;

    r.players.push(socket.id);

    if (r.players.length === 1) {
      socket.emit("start", { symbol:"X", boardSize: r.boardSize, winLen: r.winLen });
    } else {
      socket.emit("start", { symbol:"O", boardSize: r.boardSize, winLen: r.winLen });
      const p1 = io.sockets.sockets.get(r.players[0]);
      if (p1) p1.emit("start", { symbol:"X", boardSize: r.boardSize, winLen: r.winLen });
    }
  });

  socket.on("play", (d) => {
    if (rooms[d.room]) {
      rooms[d.room].board[d.i] = d.s;
      rooms[d.room].current = d.s === "X" ? "O" : "X";
    }
    socket.to(d.room).emit("play", d);
  });

  socket.on("expand", ({ room, dir, boardSize, board }) => {
    let newSize = boardSize;
    let newBoard;

    if (dir === "top" || dir === "bottom") {
      newSize = boardSize + 2;
      newBoard = Array(newSize * newSize).fill("");
      const offset = dir === "top" ? 2 : 0;
      for (let r=0; r<boardSize; r++) {
        for (let c=0; c<boardSize; c++) {
          newBoard[(r + offset) * newSize + (c+1)] = board[r * boardSize + c];
        }
      }
    } else if (dir === "left" || dir === "right") {
      newSize = boardSize + 2;
      newBoard = Array(newSize * newSize).fill("");
      const colOffset = dir === "left" ? 2 : 0;
      for (let r=0; r<boardSize; r++) {
        for (let c=0; c<boardSize; c++) {
          newBoard[(r+1) * newSize + (c + colOffset)] = board[r * boardSize + c];
        }
      }
    } else { // all
      newSize = boardSize + 2;
      newBoard = Array(newSize * newSize).fill("");
      for (let r=0; r<boardSize; r++) {
        for (let c=0; c<boardSize; c++) {
          newBoard[(r+1) * newSize + (c+1)] = board[r * boardSize + c];
        }
      }
    }

    if (rooms[room]) {
      rooms[room].boardSize = newSize;
      rooms[room].board = newBoard;
    }

    io.to(room).emit("expand", {
      board: newBoard,
      boardSize: newSize,
      current: rooms[room]?.current || "X"
    });
  });

  socket.on("restart", (room) => {
    if (rooms[room]) {
      rooms[room].board = Array(rooms[room].boardSize * rooms[room].boardSize).fill("");
      rooms[room].current = "X";
    }
    io.to(room).emit("restart");
  });

  socket.on("leaveRoom", (room) => {
    socket.leave(room);
    if (rooms[room]) {
      rooms[room].players = rooms[room].players.filter(id => id !== socket.id);
      if (rooms[room].players.length === 0) delete rooms[room];
    }
  });

  socket.on("win", async (room) => {
    const r = rooms[room];
    if (!r) return;

    const winner = r.players.find(id => {
      const s = io.sockets.sockets.get(id);
      return s?.data?.username;
    });

    const winnerSocket = winner ? io.sockets.sockets.get(winner) : null;
    const winnerName = winnerSocket?.data?.username;

    if (winnerName) {
      await User.updateOne({ username: winnerName }, { $inc: { score: 1 } });
    }

    const list = await User.find().sort({ score: -1 }).limit(5);
    io.emit("score", list);
  });

  socket.on("getScore", async () => {
    const list = await User.find().sort({ score: -1 }).limit(5);
    socket.emit("score", list);
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (room && rooms[room]) {
      rooms[room].players = rooms[room].players.filter(id => id !== socket.id);
      if (rooms[room].players.length === 0) delete rooms[room];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port " + PORT));