const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const vehicles = {};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/vehicles', (req, res) => {
  res.json(Object.values(vehicles));
});

io.on('connection', (socket) => {
  socket.on('gps', (data) => {
    vehicles[data.id] = {
      ...data,
      updated: new Date().toISOString()
    };
    socket.emit('ack', { id: data.id });
  });
});

setInterval(() => {
  io.emit('vehicles', Object.values(vehicles));
}, 2000);

// Simulador incorporado
const VEHICLES = [
  { id: 'Veh-001', lat: 19.4326, lng: -99.1332, angle: 0 },
  { id: 'Veh-002', lat: 19.4200, lng: -99.1500, angle: 90 },
  { id: 'Veh-003', lat: 19.4450, lng: -99.1200, angle: 180 },
  { id: 'Veh-004', lat: 19.4100, lng: -99.1450, angle: 270 },
  { id: 'Veh-005', lat: 19.4380, lng: -99.1100, angle: 45 },
];

setInterval(() => {
  for (const v of VEHICLES) {
    v.angle += (Math.random() - 0.5) * 20;
    const speed = Math.random() * 80;
    const dist = speed / 3600 * 0.01;
    v.lat += Math.cos(v.angle * Math.PI / 180) * dist;
    v.lng += Math.sin(v.angle * Math.PI / 180) * dist;

    vehicles[v.id] = {
      id: v.id,
      lat: Math.round(v.lat * 1e6) / 1e6,
      lng: Math.round(v.lng * 1e6) / 1e6,
      speed: Math.round(speed * 10) / 10,
      ignition: speed > 1,
      updated: new Date().toISOString()
    };
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`GPS Tracker corriendo en http://localhost:${PORT}`);
});
