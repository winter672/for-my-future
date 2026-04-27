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

// ===== CONNECT DB =====
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

// ===== LOGIN PAGE =====
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

// ===== LOGIN =====
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
    console.log(err);
    res.send("ERROR: " + err.message);
  }
});

// ===== GAME PAGE =====
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
  background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
  color: white;
  text-align: center;
}

h1 { text-shadow: 0 0 10px cyan; }

input {
  padding: 10px;
  border-radius: 8px;
  border: none;
}

button {
  padding: 10px;
  border-radius: 10px;
  border: none;
  background: cyan;
  cursor: pointer;
}

#board {
  display: grid;
  grid-template-columns: repeat(3, 100px);
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}

.cell {
  width: 100px;
  height: 100px;
  font-size: 40px;
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
}

.cell:hover {
  box-shadow: 0 0 10px cyan;
}
</style>

</head>
<body>

<h1>🎮 CARO ONLINE</h1>

<input id="room" placeholder="Room Code">
<button onclick="join()">Join</button>

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

function join(){
  room=document.getElementById("room").value;
  socket.emit("joinRoom", room);
}

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

function play(i){
  if(board[i]||current!==mySymbol)return;
  board[i]=mySymbol;
  socket.emit("play",{room,i,s:mySymbol});
  draw();
  check();
}

function draw(){
  let html="";
  for(let i=0;i<9;i++){
    let color = board[i]=="X"?"cyan":"orange";
    html += "<div class='cell' style='color:"+color+"' onclick='play("+i+")'>"+board[i]+"</div>";
  }
  document.getElementById("board").innerHTML=html;
}

function check(){
  const w=[[0,1,2],[3,4,5],[6,7,8],[0,4,8],[2,4,6]];
  for(let p of w){
    if(board[p[0]] && board[p[0]]===board[p[1]] && board[p[1]]===board[p[2]]){
      socket.emit("win",room);
    }
  }
}

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

    if(rooms[room].length===1)
      socket.emit("start","X");
    else{
      socket.emit("start","O");
      socket.to(room).emit("start","X");
    }
  });

  socket.on("play",(d)=>{
    socket.to(d.room).emit("play",d);
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