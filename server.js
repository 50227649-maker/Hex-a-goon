const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] }, transports: ['websocket','polling'] });
app.get('/', (_,res)=>res.send('Glaciar Hexagonal multiplayer server online 🧊'));
app.get('/health', (_,res)=>res.json({ok:true,rooms:rooms.size}));
const rooms = new Map();
const makeCode = () => { const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c=''; for(let i=0;i<5;i++) c+=chars[Math.floor(Math.random()*chars.length)]; } while(rooms.has(c)); return c; };
function publicPlayers(room){return [...room.players.values()].map(p=>({id:p.id,name:p.name}));}
function leave(socket){const code=socket.data.room;if(!code)return;const room=rooms.get(code);socket.data.room=null;if(!room)return;room.players.delete(socket.id);socket.leave(code);socket.to(code).emit('player-left',{id:socket.id});if(room.players.size===0)rooms.delete(code);else{if(room.host===socket.id)room.host=room.players.keys().next().value;io.to(code).emit('room-update',{players:publicPlayers(room),host:room.host});}}
io.on('connection',socket=>{
 socket.on('create-room',data=>{leave(socket);const code=makeCode();const name=String(data?.name||'Jugador').trim().slice(0,16)||'Jugador';const room={code,host:socket.id,started:false,players:new Map([[socket.id,{id:socket.id,name}]])};rooms.set(code,room);socket.join(code);socket.data.room=code;socket.emit('room-created',{code,host:socket.id,players:publicPlayers(room)});});
 socket.on('join-room',data=>{const code=String(data?.code||'').toUpperCase().trim();const room=rooms.get(code);if(!room)return socket.emit('room-error',{message:'No existe esa sala. Revisá el código.'});if(room.started)return socket.emit('room-error',{message:'La partida ya empezó.'});if(room.players.size>=8)return socket.emit('room-error',{message:'La sala está llena (máximo 8).'});leave(socket);const name=String(data?.name||'Jugador').trim().slice(0,16)||'Jugador';room.players.set(socket.id,{id:socket.id,name});socket.join(code);socket.data.room=code;socket.emit('room-joined',{code,host:room.host,players:publicPlayers(room)});socket.to(code).emit('player-joined',{id:socket.id,name});io.to(code).emit('room-update',{players:publicPlayers(room),host:room.host});});
 socket.on('start-game',()=>{const room=rooms.get(socket.data.room);if(!room||room.host!==socket.id)return;room.started=true;io.to(room.code).emit('game-start',{players:publicPlayers(room)});});
 socket.on('player-state',state=>{const room=rooms.get(socket.data.room);if(!room||!room.started)return;const clean={id:socket.id,x:num(state.x),y:num(state.y),z:num(state.z),yaw:num(state.yaw),layer:Math.max(0,Math.min(4,Math.floor(num(state.layer)))),alive:!!state.alive};socket.to(room.code).emit('player-state',clean);});
 socket.on('reset-game',()=>{const room=rooms.get(socket.data.room);if(!room||room.host!==socket.id)return;room.started=false;io.to(room.code).emit('game-reset');});
 socket.on('disconnect',()=>leave(socket));
});
function num(v){v=Number(v);return Number.isFinite(v)?Math.max(-1000,Math.min(1000,v)):0;}
const port=process.env.PORT||3000;server.listen(port,'0.0.0.0',()=>console.log('Glaciar server listening on '+port));
