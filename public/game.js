const socket = io();
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let player = { x: 400, y: 300, size: 20, speed: 3 };
let players = {};

document.addEventListener('keydown', (e) => {
  if (e.key === 'w') player.y -= player.speed;
  if (e.key === 's') player.y += player.speed;
  if (e.key === 'a') player.x -= player.speed;
  if (e.key === 'd') player.x += player.speed;

  socket.emit('move', { x: player.x, y: player.y });
});

socket.on('currentPlayers', (serverPlayers) => {
  players = serverPlayers;
});

socket.on('newPlayer', (data) => {
  players[data.id] = { x: data.x, y: data.y };
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
  }
});

socket.on('playerDisconnected', (id) => {
  delete players[id];
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw all players
  for (let id in players) {
    ctx.fillStyle = id === socket.id ? 'lime' : 'red';
    ctx.fillRect(players[id].x, players[id].y, player.size, player.size);
  }

  requestAnimationFrame(draw);
}
draw();
