const socket = io();
let players = {};
let bullets = [];
const mySize = 20;
const mySpeed = 3;

const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// -------------------- Navigation --------------------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('main-menu').style.display = 'none';
}

function backToMenu() {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('main-menu').style.display = 'block';
}

function goToQueue() { showScreen('queue-screen'); }
function goToParty() { showScreen('party-screen'); }
function goToBot() { showScreen('bot-screen'); }
function openSettings() { showScreen('settings-screen'); }

// -------------------- Name --------------------
function setName() {
  const name = document.getElementById('player-name').value.trim();
  if (name) {
    socket.emit('setName', name);
  } 
}

// -------------------- Party --------------------
function generateInviteCode() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  document.getElementById('invite-code-display').innerText = "Your code: " + code;
  socket.emit('createParty', { code });
  enterLobby();
}

function joinWithCode() {
  const code = document.getElementById('join-code').value.trim();
  if (code) {
    socket.emit('joinParty', { code });
    enterLobby();
  } else {
    alert("Please enter a code!");
  }
}

function enterLobby() {
  document.getElementById('party-lobby').classList.remove('hidden');
}

function startMatch() {
  const code = document.getElementById('invite-code-display').innerText.replace("Your code: ", "").trim();
  if (code) {
    socket.emit('startMatch', { code });
  }
}

// -------------------- Party Updates --------------------
socket.on('partyUpdate', ({ code, leader, members }) => {
  const list = document.getElementById('party-players');
  list.innerHTML = `<li>Party Code: ${code}</li>`;
  members.forEach(m => {
    const item = document.createElement('li');
    item.textContent = `${m.name} (${m.id})`;
    list.appendChild(item);
  });

  const startBtn = document.getElementById('start-match-btn');
  if (leader === socket.id) {
    startBtn.classList.remove('hidden');
  } else {
    startBtn.classList.add('hidden');
  }
});

// -------------------- Match Start --------------------
socket.on('matchStarted', ({ members }) => {
  showScreen('battlefield-screen');
  players = {};
  members.forEach(m => {
    players[m.id] = { ...m, hp: 100, dead: false };
  });
});

// -------------------- Movement --------------------
let keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;

  // Shooting keys
  if (['i','j','k','l'].includes(e.key)) {
    shoot(e.key);
  }

  // Weapon switch
  if (['1','2','3'].includes(e.key)) {
    currentWeapon = parseInt(e.key);
  }
});
document.addEventListener('keyup', (e) => { keys[e.key] = false; });

function updateMovement() {
  const me = players[socket.id];
  if (!me || me.dead) return;
  if (keys['w']) me.y -= mySpeed;
  if (keys['s']) me.y += mySpeed;
  if (keys['a']) me.x -= mySpeed;
  if (keys['d']) me.x += mySpeed;
  socket.emit('move', { x: me.x, y: me.y });
}

// -------------------- Weapons --------------------
let currentWeapon = 1; // 1=Sniper, 2=AR/SMG, 3=Knife
let lastShotTime = 0;

function shoot(directionKey) {
  const now = Date.now();
  const me = players[socket.id];
  if (!me || me.dead) return;

  const weapons = {
    1: { cooldown: 1000 }, // Sniper
    2: { cooldown: 150 },  // AR/SMG
    3: { cooldown: 500 }   // Knife
  };

  const w = weapons[currentWeapon];
  if (now - lastShotTime < w.cooldown) return;
  lastShotTime = now;

  socket.emit('shoot', { weapon: currentWeapon, dir: directionKey });
}

// -------------------- Socket Events --------------------
socket.on('currentPlayers', (serverPlayers) => { players = serverPlayers; });
socket.on('newPlayer', (data) => { players[data.id] = data; });
socket.on('playerMoved', (data) => { if (data.id !== socket.id) players[data.id] = data; });
socket.on('playerDisconnected', (id) => { delete players[id]; });

socket.on('bulletsUpdate', (serverBullets) => { bullets = serverBullets; });
socket.on('playerHit', ({ victim, hp }) => {
  if (players[victim]) players[victim].hp = hp;
});
socket.on('playerKilled', ({ killer, victim }) => {
  if (players[victim]) {
    players[victim].dead = true;
  }
  if (victim === socket.id) {
    // Respawn after 3 seconds
    setTimeout(() => {
      socket.emit('respawn');
    }, 3000);
  }
});
socket.on('playerRespawned', ({ id, x, y, hp, dead }) => {
  players[id] = { ...players[id], x, y, hp, dead };
});

// -------------------- Draw Loop --------------------
function draw() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  updateMovement();

  // Draw players
  for (let id in players) {
    const p = players[id];
    if (p.dead) {
      ctx.fillStyle = 'gray';
      ctx.fillRect(p.x, p.y, mySize, mySize);
      ctx.fillStyle = 'white';
      ctx.fillText("DEAD", p.x, p.y - 5);
      continue;
    }

    ctx.fillStyle = id === socket.id ? 'lime' : 'red';
    ctx.fillRect(p.x, p.y, mySize, mySize);

    ctx.fillStyle = 'white';
    ctx.font = '12px monospace';
    ctx.fillText(`${p.name || "Anon"} HP:${p.hp ?? 100}`, p.x, p.y - 5);
  }

  // Draw bullets + knife circles
  bullets.forEach(b => {
    if (b.knife) {
      ctx.strokeStyle = 'yellow';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.fillStyle = b.owner === socket.id ? 'yellow' : 'orange';
      ctx.fillRect(b.x, b.y, b.size, b.size);
    }
  });

  requestAnimationFrame(draw);
}
draw();
