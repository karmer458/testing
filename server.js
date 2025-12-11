const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};   // { socketId: { id, name, x, y, hp, dead } }
let parties = {};   // { code: { leader: socketId, members: [socketIds] } }
let bullets = [];   // server-side bullets & knife circles

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Default player
  players[socket.id] = { id: socket.id, name: "Anonymous", x: 400, y: 300, hp: 100, dead: false };

  // Set name
  socket.on('setName', (name) => {
    if (players[socket.id]) players[socket.id].name = name;
  });

  // Movement
  socket.on('move', (data) => {
    const p = players[socket.id];
    if (p && !p.dead) {
      p.x = data.x;
      p.y = data.y;
      io.emit('playerMoved', p);
    }
  });

  // Shooting
  socket.on('shoot', ({ weapon, dir }) => {
    const me = players[socket.id];
    if (!me || me.dead) return;

    const weapons = {
      1: { cooldown: 1000, size: 15, speed: 40, damage: 75 }, // Sniper
      2: { cooldown: 150, size: 5, speed: 12, damage: 20 },    // AR/SMG
      3: { cooldown: 500, size: 40, speed: 0, damage: 100 }    // Knife
    };

    const w = weapons[weapon];
    if (!w) return;

    // Knife = instant AoE + broadcast circle
    // Knife = instant AoE + broadcast circle
if (weapon === 3) {
  // Damage players in range...
  for (let id in players) {
    if (id !== socket.id) {
      const p = players[id];
      if (!p || p.dead) continue;
      const dx = p.x - me.x;
      const dy = p.y - me.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < w.size) {
        p.hp -= w.damage;
        if (p.hp <= 0) {
          p.dead = true;
          io.emit('playerKilled', { killer: socket.id, victim: id });
        } else {
          io.emit('playerHit', { victim: id, hp: p.hp });
        }
      }
    }
  }

  // Broadcast knife circle
  bullets.push({
    owner: socket.id,
    x: me.x,
    y: me.y,
    radius: w.size,
    knife: true,
    ttl: 1 // short-lived
  });

  return;
}


    // Normal bullet
    let dx = 0, dy = 0;
    if (dir === 'i') dy = -1;
    if (dir === 'k') dy = 1;
    if (dir === 'j') dx = -1;
    if (dir === 'l') dx = 1;

    bullets.push({
      owner: socket.id,
      x: me.x,
      y: me.y,
      dx, dy,
      speed: w.speed,
      size: w.size,
      damage: w.damage
    });
  });

  // Respawn
  socket.on('respawn', () => {
    if (!players[socket.id]) return;
    players[socket.id] = {
      ...players[socket.id],
      x: 400,
      y: 300,
      hp: 100,
      dead: false
    };
    io.emit('playerRespawned', {
      id: socket.id,
      x: players[socket.id].x,
      y: players[socket.id].y,
      hp: players[socket.id].hp,
      dead: players[socket.id].dead
    });
  });

  // Party creation/join/start
  socket.on('createParty', ({ code }) => {
    socket.join(code);
    parties[code] = { leader: socket.id, members: [socket.id] };
    io.to(code).emit('partyUpdate', {
      code,
      leader: socket.id,
      members: parties[code].members.map(id => players[id])
    });
  });

  socket.on('joinParty', ({ code }) => {
    if (!parties[code]) return;
    socket.join(code);
    parties[code].members.push(socket.id);
    io.to(code).emit('partyUpdate', {
      code,
      leader: parties[code].leader,
      members: parties[code].members.map(id => players[id])
    });
  });

  socket.on('startMatch', ({ code }) => {
    if (parties[code] && parties[code].leader === socket.id) {
      io.to(code).emit('matchStarted', {
        members: parties[code].members.map(id => players[id])
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);

    for (let code in parties) {
      parties[code].members = parties[code].members.filter(id => id !== socket.id);
      io.to(code).emit('partyUpdate', {
        code,
        leader: parties[code].leader,
        members: parties[code].members.map(id => players[id])
      });
    }
  });
});

// Bullet update loop
setInterval(() => {
  bullets.forEach((b, i) => {
    if (b.knife) {
      // knife circle disappears after one tick
      b.ttl--;
      if (b.ttl <= 0) {
        bullets.splice(i,5);
      }
      return;
    }

    b.x += b.dx * b.speed;
    b.y += b.dy * b.speed;

    // Check collisions
    for (let id in players) {
      if (id === b.owner) continue;
      const p = players[id];
      if (!p || p.dead) continue;
      if (p.x < b.x+b.size && p.x+20 > b.x && p.y < b.y+b.size && p.y+20 > b.y) {
        p.hp -= b.damage;
        if (p.hp <= 0) {
          p.dead = true;
          io.emit('playerKilled', { killer: b.owner, victim: id });
        } else {
          io.emit('playerHit', { victim: id, hp: p.hp });
        }
        bullets.splice(i,1);
        return;
      }
    }

    // Remove if off screen
    if (b.x < 0 || b.y < 0 || b.x > 800 || b.y > 600) {
      bullets.splice(i,1);
    }
  });

  // Broadcast bullets
  io.emit('bulletsUpdate', bullets);
}, 50);

http.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
