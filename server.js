const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] }, transports: ['websocket', 'polling'] });
app.get('/', (_, res) => res.send('Glaciar Hexagonal multiplayer server online 🧊'));
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));

const rooms = new Map();

// ───────── Geometría del glaciar (idéntica al cliente) ─────────
const R = 1.18;
const LAYER_RADIUS = [5, 4, 4, 3, 2];
const FALL_Y = -11.5;
const TILE_DELAY = { 1: 0.42, 2: 0.5, 3: 0.42 }; // segundos que dura cada estado antes de pasar al siguiente
const tileKey = (q, r, l) => `${q},${r},${l}`;

function buildTiles() {
  const tiles = new Map();
  for (let l = 0; l < LAYER_RADIUS.length; l++) {
    const rad = LAYER_RADIUS[l];
    for (let q = -rad; q <= rad; q++) {
      for (let r = -rad; r <= rad; r++) {
        if (Math.abs(q + r) > rad) continue;
        const key = tileKey(q, r, l);
        tiles.set(key, { key, q, r, l, x: R * 1.5 * q, z: R * Math.sqrt(3) * (r + q / 2), state: 0, t: 0 });
      }
    }
  }
  return tiles;
}

function nearTile(room, x, z, l) {
  let best = null, bd = Infinity;
  for (const t of room.tiles.values()) {
    if (t.l !== l) continue;
    const d = (t.x - x) ** 2 + (t.z - z) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  return bd < R * R * 2.4 ? best : null;
}

// ───────── Salas ─────────
const makeCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = ''; for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)]; } while (rooms.has(c));
  return c;
};
const publicPlayers = room => [...room.players.values()].map(p => ({ id: p.id, name: p.name }));

function makeRoom(code, hostId, name) {
  return {
    code, host: hostId,
    phase: 'lobby',            // lobby | playing | ended
    players: new Map([[hostId, { id: hostId, name }]]),
    tiles: new Map(), alive: new Set(), matchSize: 0, lastTick: 0
  };
}

function pickSpawns(room) {
  const top = [...room.tiles.values()].filter(t => t.l === 0);
  for (let i = top.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [top[i], top[j]] = [top[j], top[i]]; }
  const spawns = {};
  [...room.players.keys()].forEach((id, i) => { spawns[id] = { q: top[i].q, r: top[i].r }; });
  return spawns;
}

// Inicia (o reinicia) una partida en la misma sala, con todos los jugadores que hay ahora.
function startMatch(room) {
  room.tiles = buildTiles();
  room.alive = new Set(room.players.keys());
  room.matchSize = room.players.size;
  room.phase = 'playing';
  room.lastTick = Date.now();
  io.to(room.code).emit('game-start', { players: publicPlayers(room), spawns: pickSpawns(room) });
}

function checkOver(room) {
  if (room.phase !== 'playing') return;
  const n = room.alive.size;
  const over = room.matchSize > 1 ? n <= 1 : n === 0;
  if (!over) return;
  room.phase = 'ended';
  const winnerId = room.matchSize > 1 && n === 1 ? [...room.alive][0] : null;
  const winner = winnerId ? room.players.get(winnerId) : null;
  io.to(room.code).emit('game-over', { winnerId: winner ? winnerId : null, winnerName: winner ? winner.name : null });
}

function eliminate(room, id) {
  if (room.phase !== 'playing' || !room.alive.has(id)) return;
  room.alive.delete(id);
  io.to(room.code).emit('eliminated', { id });
  checkOver(room);
}

// El hielo lo simula SOLO el servidor: avanza el estado de cada baldosa y avisa a todos los clientes.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase !== 'playing') continue;
    const dt = Math.min(0.2, (now - room.lastTick) / 1000);
    room.lastTick = now;
    const changes = [];
    for (const [key, t] of room.tiles) {
      if (!t.state) continue;
      t.t += dt;
      if (t.t < TILE_DELAY[t.state]) continue;
      t.t = 0;
      if (t.state === 3) { room.tiles.delete(key); changes.push([key, 4]); }
      else { t.state++; changes.push([key, t.state]); }
    }
    if (changes.length) io.to(room.code).emit('tiles', changes);
  }
}, 50);

function leave(socket) {
  const code = socket.data.room;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.room = null;
  if (!room) return;
  room.players.delete(socket.id);
  socket.leave(code);
  socket.to(code).emit('player-left', { id: socket.id });
  if (room.players.size === 0) { rooms.delete(code); return; }
  if (room.host === socket.id) room.host = room.players.keys().next().value;
  io.to(code).emit('room-update', { players: publicPlayers(room), host: room.host });
  if (room.alive.delete(socket.id)) checkOver(room);
}

const cleanName = n => String(n || 'Jugador').trim().slice(0, 16) || 'Jugador';
const num = v => { v = Number(v); return Number.isFinite(v) ? Math.max(-1000, Math.min(1000, v)) : 0; };

io.on('connection', socket => {
  socket.on('create-room', data => {
    leave(socket);
    const code = makeCode();
    const room = makeRoom(code, socket.id, cleanName(data?.name));
    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    socket.emit('room-created', { code, host: socket.id, players: publicPlayers(room) });
  });

  socket.on('join-room', data => {
    const code = String(data?.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return socket.emit('room-error', { message: 'No existe esa sala. Revisá el código.' });
    if (room.phase !== 'lobby') return socket.emit('room-error', { message: 'La partida ya empezó.' });
    if (room.players.size >= 8) return socket.emit('room-error', { message: 'La sala está llena (máximo 8).' });
    leave(socket);
    const name = cleanName(data?.name);
    room.players.set(socket.id, { id: socket.id, name });
    socket.join(code);
    socket.data.room = code;
    socket.emit('room-joined', { code, host: room.host, players: publicPlayers(room) });
    socket.to(code).emit('player-joined', { id: socket.id, name });
    io.to(code).emit('room-update', { players: publicPlayers(room), host: room.host });
  });

  // Inicio de la primera partida (lobby) y "jugar otra vez" (ended): siempre dentro de la misma sala.
  const hostStart = () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.host !== socket.id || room.phase === 'playing') return;
    startMatch(room);
  };
  socket.on('start-game', hostStart);
  socket.on('restart-game', hostStart);

  socket.on('player-state', state => {
    const room = rooms.get(socket.data.room);
    if (!room || room.phase !== 'playing' || !room.alive.has(socket.id)) return;
    const clean = {
      id: socket.id, x: num(state.x), y: num(state.y), z: num(state.z), yaw: num(state.yaw),
      layer: Math.max(0, Math.min(4, Math.floor(num(state.layer)))), ground: !!state.ground
    };
    if (clean.y < FALL_Y) return eliminate(room, socket.id);
    if (clean.ground) {
      const t = nearTile(room, clean.x, clean.z, clean.layer);
      if (t && t.state === 0) { t.state = 1; t.t = 0; io.to(room.code).emit('tiles', [[t.key, 1]]); }
    }
    socket.to(room.code).emit('player-state', clean);
  });

  // El cliente avisa que cayó al océano (por si el último estado no llegó a enviarse).
  socket.on('fell', () => {
    const room = rooms.get(socket.data.room);
    if (room) eliminate(room, socket.id);
  });

  socket.on('disconnect', () => leave(socket));
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => console.log('Glaciar server listening on ' + port));
