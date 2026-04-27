const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const mongoose = require("mongoose");
 
const app = express();
const server = http.createServer(app);
const io = new Server(server);
 
// ===== DB =====
mongoose.connectmongoose.connect(process.env.MONGO_URI);
const User = mongoose.model("User", new mongoose.Schema({
  username: String,
  score: { type: Number, default: 0 }
}));
 
// ===== SESSION =====
const sessionMiddleware = session({
  secret: "secret",
  resave: false,
  saveUninitialized: false
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);
 
// ===== ROOMS =====
let rooms = {};
 
// ===== SERVE HTML =====
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Tic-Tac-Toe</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet"/>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    :root {
      --x-color: #00f5ff;
      --o-color: #ff9500;
      --bg: #050a0e;
      --surface: #0d1821;
      --border: #1a2a3a;
      --win-glow: #ffd700;
    }
 
    * { margin: 0; padding: 0; box-sizing: border-box; }
 
    body {
      background: var(--bg);
      color: #e0e0e0;
      font-family: 'Share Tech Mono', monospace;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
 
    /* ── Animated grid background ── */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      animation: gridMove 20s linear infinite;
      pointer-events: none;
      z-index: 0;
    }
 
    @keyframes gridMove {
      0%   { background-position: 0 0; }
      100% { background-position: 40px 40px; }
    }
 
    .container {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }
 
    h1 {
      font-family: 'Orbitron', sans-serif;
      font-size: 2rem;
      letter-spacing: 6px;
      color: var(--x-color);
      text-shadow: 0 0 20px var(--x-color), 0 0 40px rgba(0,245,255,0.3);
      animation: titlePulse 3s ease-in-out infinite;
    }
 
    @keyframes titlePulse {
      0%, 100% { text-shadow: 0 0 20px var(--x-color), 0 0 40px rgba(0,245,255,0.3); }
      50%       { text-shadow: 0 0 30px var(--x-color), 0 0 60px rgba(0,245,255,0.5), 0 0 80px rgba(0,245,255,0.2); }
    }
 
    /* ── Join section ── */
    .join-area {
      display: flex;
      gap: 8px;
      align-items: center;
    }
 
    input {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--x-color);
      padding: 8px 14px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.9rem;
      outline: none;
      border-radius: 4px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
 
    input:focus {
      border-color: var(--x-color);
      box-shadow: 0 0 10px rgba(0,245,255,0.2);
    }
 
    button {
      background: transparent;
      border: 1px solid var(--x-color);
      color: var(--x-color);
      padding: 8px 18px;
      font-family: 'Orbitron', sans-serif;
      font-size: 0.7rem;
      letter-spacing: 2px;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
      text-transform: uppercase;
    }
 
    button:hover {
      background: rgba(0,245,255,0.1);
      box-shadow: 0 0 15px rgba(0,245,255,0.3);
    }
 
    button.restart-btn {
      border-color: var(--o-color);
      color: var(--o-color);
    }
 
    button.restart-btn:hover {
      background: rgba(255,149,0,0.1);
      box-shadow: 0 0 15px rgba(255,149,0,0.3);
    }
 
    /* ── Board ── */
    #board {
      display: grid;
      grid-template-columns: repeat(3, 100px);
      grid-template-rows: repeat(3, 100px);
      gap: 6px;
      background: var(--border);
      padding: 6px;
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 0 30px rgba(0,245,255,0.05);
    }
 
    .cell {
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Orbitron', sans-serif;
      font-size: 2.8rem;
      font-weight: 900;
      cursor: pointer;
      border-radius: 4px;
      border: 1px solid transparent;
      transition: background 0.15s, border-color 0.15s, transform 0.1s;
      user-select: none;
    }
 
    .cell:hover:not(.taken) {
      background: #111e2a;
      border-color: rgba(0,245,255,0.15);
      transform: scale(1.04);
    }
 
    .cell.taken { cursor: default; }
 
    .cell.pop {
      animation: cellPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
 
    @keyframes cellPop {
      0%   { transform: scale(0.5); opacity: 0.4; }
      100% { transform: scale(1);   opacity: 1; }
    }
 
    /* ── Win highlight ── */
    .cell.win-cell {
      animation: winPulse 0.55s ease-in-out infinite alternate !important;
      border-color: var(--win-glow) !important;
      background: rgba(255,215,0,0.08) !important;
    }
 
    @keyframes winPulse {
      from { transform: scale(1);    box-shadow: 0 0 10px var(--win-glow); }
      to   { transform: scale(1.12); box-shadow: 0 0 28px var(--win-glow), 0 0 50px rgba(255,215,0,0.4); }
    }
 
    /* ── Status text ── */
    #status {
      font-size: 0.85rem;
      letter-spacing: 3px;
      color: #4a6a8a;
      min-height: 20px;
      text-align: center;
    }
 
    /* ── Score ── */
    #score {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 0.85rem;
      line-height: 1.8;
      min-width: 200px;
      text-align: center;
      color: #5a8aaa;
    }
 
    /* ══════════════════════════════════════
       WIN OVERLAY
    ══════════════════════════════════════ */
    #winOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999;
      animation: overlayFadeIn 0.3s ease;
    }
 
    @keyframes overlayFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
 
    .win-box {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      animation: winBoxPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
 
    @keyframes winBoxPop {
      0%   { transform: scale(0.2) rotate(-8deg); opacity: 0; }
      100% { transform: scale(1)   rotate(0deg);  opacity: 1; }
    }
 
    .win-symbol {
      font-family: 'Orbitron', sans-serif;
      font-size: 6rem;
      font-weight: 900;
      line-height: 1;
      animation: symbolSpin 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
    }
 
    @keyframes symbolSpin {
      0%   { transform: rotateY(90deg) scale(0.5); }
      100% { transform: rotateY(0deg)  scale(1); }
    }
 
    .win-label {
      font-family: 'Orbitron', sans-serif;
      font-size: 1.8rem;
      font-weight: 700;
      letter-spacing: 8px;
      color: #fff;
      text-shadow: 0 0 20px var(--win-glow), 0 0 50px rgba(255,215,0,0.5);
    }
 
    .win-sub {
      font-size: 0.75rem;
      letter-spacing: 3px;
      color: rgba(255,255,255,0.4);
      margin-top: 4px;
    }
 
    /* ── Particles ── */
    .particles {
      position: absolute;
      inset: -60px;
      pointer-events: none;
    }
 
    .particle {
      position: absolute;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      animation: particleFly var(--dur) ease-out var(--delay) both;
    }
 
    @keyframes particleFly {
      0%   { transform: translate(0,0) scale(1);      opacity: 1; }
      100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
    }
 
    /* ── Draw overlay ── */
    #drawOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999;
      animation: overlayFadeIn 0.3s ease;
    }
 
    .draw-box {
      font-family: 'Orbitron', sans-serif;
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: 6px;
      color: #fff;
      opacity: 0.5;
      animation: winBoxPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>TIC·TAC·TOE</h1>
 
    <div class="join-area">
      <input id="room" placeholder="ROOM ID" />
      <button onclick="join()">JOIN</button>
    </div>
 
    <div id="status">WAITING...</div>
 
    <div id="board"></div>
 
    <button class="restart-btn" onclick="restartGame()">RESTART</button>
 
    <div id="score"></div>
  </div>
 
  <script>
    const socket = io();
    let room = "";
    let mySymbol = "";
    let board = ["","","","","","","","",""];
    let current = "X";
    let gameOver = false;
 
    // ===== JOIN =====
    function join(){
      room = document.getElementById("room").value.trim();
      if(!room) return;
      socket.emit("joinRoom", room);
    }
 
    // ===== RESTART =====
    function restartGame(){
      socket.emit("restart", room);
    }
 
    // ===== SOCKET =====
    socket.on("start", (symbol) => {
      mySymbol = symbol;
      setStatus(symbol === "X" ? "YOU ARE X — WAIT FOR OPPONENT" : "YOU ARE O — WAIT FOR OPPONENT");
      draw();
    });
 
    socket.on("play", (d) => {
      board[d.i] = d.s;
      current = d.s === "X" ? "O" : "X";
      drawWithPop(d.i);
      check();
      if(!gameOver) setStatus("YOUR TURN");
    });
 
    socket.on("restart", () => {
      board = ["","","","","","","","",""];
      current = "X";
      gameOver = false;
      document.getElementById("winOverlay")?.remove();
      document.getElementById("drawOverlay")?.remove();
      setStatus(mySymbol ? "YOUR TURN" : "WAITING...");
      draw();
    });
 
    // ===== PLAY =====
    function play(i){
      if(board[i] || current !== mySymbol || gameOver) return;
 
      board[i] = mySymbol;
      socket.emit("play", { room, i, s: mySymbol });
 
      drawWithPop(i);
      check();
      if(!gameOver) setStatus("OPPONENT'S TURN");
    }
 
    // ===== DRAW (full redraw) =====
    function draw(){
      const boardEl = document.getElementById("board");
      let html = "";
      for(let i = 0; i < 9; i++){
        const sym = board[i];
        const color = sym === "X" ? "var(--x-color)" : sym === "O" ? "var(--o-color)" : "transparent";
        const taken = sym ? " taken" : "";
        html += \`<div class="cell\${taken}" style="color:\${color}" onclick="play(\${i})">\${sym}</div>\`;
      }
      boardEl.innerHTML = html;
    }
 
    // ===== DRAW WITH POP ANIMATION on specific cell =====
    function drawWithPop(idx){
      draw();
      const cells = document.querySelectorAll(".cell");
      if(cells[idx]){
        cells[idx].classList.add("pop");
        cells[idx].addEventListener("animationend", () => cells[idx].classList.remove("pop"), { once: true });
      }
    }
 
    // ===== CHECK WIN =====
    function check(){
      const wins = [
        [0,1,2],[3,4,5],[6,7,8],   // rows
        [0,3,6],[1,4,7],[2,5,8],   // cols
        [0,4,8],[2,4,6]            // diagonals
      ];
 
      for(let combo of wins){
        const [a,b,c] = combo;
        if(board[a] && board[a] === board[b] && board[b] === board[c]){
          gameOver = true;
          highlightWin(combo);
          setTimeout(() => showWinOverlay(board[a]), 400);
          socket.emit("win", room);
          return;
        }
      }
 
      // Draw
      if(!board.includes("")){
        gameOver = true;
        setTimeout(() => showDrawOverlay(), 300);
      }
    }
 
    // ===== HIGHLIGHT WIN CELLS =====
    function highlightWin(combo){
      const cells = document.querySelectorAll(".cell");
      combo.forEach(i => {
        cells[i].classList.add("win-cell");
        cells[i].onclick = null;
      });
    }
 
    // ===== WIN OVERLAY =====
    function showWinOverlay(winner){
      const color = winner === "X" ? "var(--x-color)" : "var(--o-color)";
      const glow  = winner === "X" ? "#00f5ff" : "#ff9500";
 
      const overlay = document.createElement("div");
      overlay.id = "winOverlay";
      overlay.innerHTML = \`
        <div class="win-box">
          <div class="particles" id="particleContainer"></div>
          <div class="win-symbol" style="color:\${color}; text-shadow: 0 0 30px \${glow}, 0 0 60px \${glow}40;">\${winner}</div>
          <div class="win-label">WINS!</div>
          <div class="win-sub">CLICK RESTART TO PLAY AGAIN</div>
        </div>
      \`;
      document.body.appendChild(overlay);
 
      // Spawn particles
      spawnParticles(glow);
 
      // Auto-remove after 4s
      setTimeout(() => overlay?.remove(), 4000);
    }
 
    // ===== PARTICLES =====
    function spawnParticles(color){
      const container = document.getElementById("particleContainer");
      if(!container) return;
 
      const colors = [color, "#fff", "#ffd700", color + "99"];
      for(let i = 0; i < 28; i++){
        const p = document.createElement("div");
        p.className = "particle";
        const angle = (Math.random() * 360) * (Math.PI / 180);
        const dist  = 80 + Math.random() * 120;
        p.style.cssText = \`
          left: 50%; top: 50%;
          background: \${colors[Math.floor(Math.random() * colors.length)]};
          --tx: \${Math.cos(angle) * dist}px;
          --ty: \${Math.sin(angle) * dist}px;
          --dur: \${0.6 + Math.random() * 0.8}s;
          --delay: \${Math.random() * 0.3}s;
          box-shadow: 0 0 6px \${color};
        \`;
        container.appendChild(p);
      }
    }
 
    // ===== DRAW OVERLAY =====
    function showDrawOverlay(){
      const overlay = document.createElement("div");
      overlay.id = "drawOverlay";
      overlay.innerHTML = \`<div class="draw-box">DRAW</div>\`;
      document.body.appendChild(overlay);
      setTimeout(() => overlay?.remove(), 3000);
    }
 
    // ===== STATUS =====
    function setStatus(msg){
      document.getElementById("status").textContent = msg;
    }
  </script>
</body>
</html>`);
});
 
// ===== SOCKET =====
io.on("connection", (socket) => {
 
  socket.on("joinRoom", (room) => {
    socket.join(room);
 
    if(!rooms[room]) rooms[room] = [];
    if(rooms[room].length >= 2) return;
 
    rooms[room].push(socket.id);
 
    if(rooms[room].length === 1){
      socket.emit("start", "X");
    } else {
      socket.emit("start", "O");
      socket.to(room).emit("start", "X");
    }
  });
 
  socket.on("play", (d) => {
    socket.to(d.room).emit("play", d);
  });
 
  // ===== RESTART =====
  socket.on("restart", (room) => {
    io.to(room).emit("restart");
  });
 
  socket.on("win", async (room) => {
    let players = rooms[room] || [];
 
    for(let id of players){
      let s = io.sockets.sockets.get(id);
      let user = s?.request?.session?.user;
 
      if(user){
        await User.updateOne(
          { username: user },
          { $inc: { score: 1 } }
        );
      }
    }
 
    let list = await User.find().sort({ score: -1 }).limit(5);
    io.emit("score", list);
  });
 
  socket.on("score", (list) => {
    let html = "";
    list.forEach(u => {
      html += u.username + " : " + u.score + "<br>";
    });
    document.getElementById("score").innerHTML = html;
  });
 
});
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port " + PORT));