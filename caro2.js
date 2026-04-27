const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ===== SESSION =====
const sessionMiddleware = session({
  secret: 'secret',
  resave: false,
  saveUninitialized: false
});

app.use(sessionMiddleware);

// ให้ socket ใช้ session ได้
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// ===== CONNECT DB (ใช้ ENV) =====
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("DB connected"))
.catch(err=>console.log(err));

// ===== USER MODEL =====
const User = mongoose.model('User', {
  username: String,
  password: String,
  score: { type: Number, default: 0 }
});

let rooms = {};

// ===== LOGIN PAGE =====
app.get('/', (req, res) => {
  res.send(`
  <h2>Login</h2>
  <form method="POST" action="/login">
    <input name="username" placeholder="Username"><br>
    <input name="password" type="password" placeholder="Password"><br>
    <button>Login / Register</button>
  </form>
  `);
});

// ===== LOGIN =====
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  let user = await User.findOne({ username });

  if (!user) {
    const hash = await bcrypt.hash(password, 10);
    user = new User({ username, password: hash });
    await user.save();
  } else {
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.send("Wrong password");
  }

  req.session.user = username;
  res.redirect('/game');
});

// ===== GAME PAGE =====
app.get('/game', (req, res) => {
  if (!req.session.user) return res.redirect('/');

  res.send(`
  <h1>Welcome ${req.session.user}</h1>

  <input id="room" placeholder="Room code">
  <button onclick="join()">Join Room</button>

  <h3>Leaderboard</h3>
  <div id="score"></div>

  <div id="game" style="display:none;">
    <h3 id="status"></h3>
    <div id="board"></div>
    <button onclick="restart()">Restart</button>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
  const socket = io();

  let room = "";
  let mySymbol = "";
  let board = ["","","","","","","","",""];
  let current = "X";

  function join() {
    room = document.getElementById("room").value;
    socket.emit("joinRoom", room);
    document.getElementById("game").style.display = "block";
  }

  socket.on("start", (symbol) => {
    mySymbol = symbol;
    draw();
  });

  socket.on("play", (data) => {
    board[data.i] = data.s;
    current = data.s === "X" ? "O" : "X";
    draw();
    check();
  });

  function play(i) {
    if (board[i] || current !== mySymbol) return;

    board[i] = mySymbol;
    socket.emit("play", { room, i, s: mySymbol });
    draw();
    check();
  }

  function draw() {
    let html = "";
    for (let i=0;i<9;i++) {
      html += "<button onclick='play("+i+")'>"+board[i]+"</button>";
    }
    document.getElementById("board").innerHTML = html;
  }

  function check() {
    const w = [[0,1,2],[3,4,5],[6,7,8],[0,4,8],[2,4,6]];
    for (let p of w) {
      if (board[p[0]] && board[p[0]]===board[p[1]] && board[p[1]]===board[p[2]]) {
        socket.emit("win", room);
      }
    }
  }

  function restart() {
    socket.emit("restart", room);
  }

  socket.on("restart", ()=>{
    board = ["","","","","","","","",""];
    draw();
  });

  socket.on("score", (list)=>{
    let html="";
    list.forEach(u=>{
      html+=u.username+": "+u.score+"<br>";
    });
    document.getElementById("score").innerHTML=html;
  });
  </script>
  `);
});

// ===== SOCKET =====
io.on("connection", (socket) => {

  socket.on("joinRoom", (room) => {
    socket.join(room);

    if (!rooms[room]) rooms[room]=[];
    if (rooms[room].length >= 2) return;

    rooms[room].push(socket.id);

    if (rooms[room].length===1)
      socket.emit("start","X");
    else if (rooms[room].length===2) {
      socket.emit("start","O");
      socket.to(room).emit("start","X");
    }
  });

  socket.on("play",(d)=>{
    socket.to(d.room).emit("play",d);
  });

  socket.on("restart",(room)=>{
    io.to(room).emit("restart");
  });

  socket.on("win", async (room)=>{
    let players = rooms[room] || [];

    for (let id of players) {
      let s = io.sockets.sockets.get(id);
      let user = s?.request?.session?.user;

      if (user) {
        await User.updateOne(
          { username: user },
          { $inc: { score: 1 } }
        );
      }
    }

    let list = await User.find().sort({ score: -1 }).limit(5);
    io.emit("score", list);
  });

  // ✅ กันหลุดแล้วค้าง
  socket.on("disconnect", () => {
    for (let room in rooms) {
      rooms[room] = rooms[room].filter(id => id !== socket.id);
    }
  });

});

// ===== PORT =====
const PORT = process.env.PORT || 3000;

http.listen(PORT, ()=>{
  console.log("Server running...");
});