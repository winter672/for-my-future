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
  saveUninitialized: true
});
app.use(sessionMiddleware);

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// ===== DB =====
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("DB connected"))
.catch(err=>console.log(err));

// ===== MODEL =====
const User = mongoose.model('User', {
  username: String,
  password: String,
  score: { type: Number, default: 0 }
});

let rooms = {};

// ===== LOGIN =====
app.get('/', (req, res) => {
  res.send(`
  <h2>Login</h2>
  <form method="POST" action="/login">
    <input name="username" placeholder="Username"><br>
    <input name="password" type="password" placeholder="Password"><br>
    <button>Login</button>
  </form>
  `);
});

// ===== LOGIN POST =====
app.post('/login', async (req, res) => {
  try {
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

  } catch (err) {
    res.send("ERROR");
  }
});

// ===== GAME =====
app.get('/game', (req, res) => {
  if (!req.session.user) return res.redirect('/');

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Caro Game</title>

<style>
body {
  margin: 0;
  font-family: 'Segoe UI';
  background: radial-gradient(circle, #0f2027, #203a43);
  color: white;
  text-align: center;
}

h1 { text-shadow: 0 0 15px cyan; }

input, button {
  padding: 10px;
  border-radius: 10px;
  border: none;
  margin: 5px;
}

button {
  background: linear-gradient(45deg, cyan, blue);
  color: white;
  cursor: pointer;
}

#board {
  display: grid;
  grid-template-columns: repeat(3, 90px);
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}

.cell {
  width: 90px;
  height: 90px;
  font-size: 35px;
  background: #111;
  border-radius: 15px;
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
}
</style>
</head>

<body>

<h1>🎮 CARO ONLINE</h1>

<input id="room" placeholder="Room Code">
<button onclick="join()">Join</button>
<button onclick="restartGame()">🔄 Restart</button>

<h3 id="status"></h3>
<div id="board"></div>

<h3>🏆 Leaderboard</h3>
<div id="score"></div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();

let room="";
let mySymbol="";
let board=["","","","","","","","",""];
let current="X";

// ===== JOIN =====
function join(){
  room=document.getElementById("room").value;
  socket.emit("joinRoom", room);
}

// ===== RESTART =====
function restartGame(){
  socket.emit("restart", room);
}

// ===== SOCKET =====
socket.on("start",(symbol)=>{
  mySymbol=symbol;
  draw();
});

socket.on("play",(d)=>{
  board[d.i]=d.s;
  current = d.s==="X"?"O":"X";
  draw();
  check();
});

socket.on("restart",()=>{
  board=["","","","","","","","",""];
  current="X";
  draw();
});

// ===== PLAY =====
function play(i){
  if(board[i]||current!==mySymbol)return;

  board[i]=mySymbol;
  socket.emit("play",{room,i,s:mySymbol});

  draw();
  check();
}

// ===== DRAW =====
function draw(){
  let html="";
  for(let i=0;i<9;i++){
    let color = board[i]=="X"?"cyan":"orange";
    html += "<div class='cell' style='color:"+color+"' onclick='play("+i+")'>"+board[i]+"</div>";
  }
  document.getElementById("board").innerHTML=html;
}

// ===== CHECK WIN =====
function check(){
  const w=[[0,1,2],[3,4,5],[6,7,8],[0,4,8],[2,4,6]];

  for(let p of w){
    if(board[p[0]] && board[p[0]]===board[p[1]] && board[p[1]]===board[p[2]]){
      socket.emit("win",room);
    }
  }
}

// ===== SCORE =====
socket.on("score",(list)=>{
  let html="";
  list.forEach(u=>{
    html+=u.username+" : "+u.score+"<br>";
  });
  document.getElementById("score").innerHTML=html;
});
</script>

</body>
</html>
  `);
});

// ===== SOCKET =====
io.on("connection",(socket)=>{

  socket.on("joinRoom",(room)=>{
    socket.join(room);

    if(!rooms[room]) rooms[room]=[];
    if(rooms[room].length>=2) return;

    rooms[room].push(socket.id);

    if(rooms[room].length===1){
      socket.emit("start","X");
    } else {
      socket.emit("start","O");
      socket.to(room).emit("start","X");
    }
  });

  socket.on("play",(d)=>{
    socket.to(d.room).emit("play",d);
  });

  // ===== RESTART =====
  socket.on("restart",(room)=>{
    io.to(room).emit("restart");
  });

  socket.on("win", async (room)=>{
    let players = rooms[room] || [];

    for(let id of players){
      let s = io.sockets.sockets.get(id);
      let user = s?.request?.session?.user;

      if(user){
        await User.updateOne(
          { username:user },
          { $inc:{ score:1 } }
        );
      }
    }

    let list = await User.find().sort({score:-1}).limit(5);
    io.emit("score", list);
  });

});

const PORT = process.env.PORT || 3000;
http.listen(PORT, ()=>console.log("Server running..."));