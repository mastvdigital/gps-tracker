const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const net = require('net');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TCP_PORT = process.env.TCP_PORT || 8001;
const vehicles = {};
const registeredDevices = {};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/vehicles', (req, res) => {
  res.json(Object.values(vehicles));
});

app.get('/api/devices', (req, res) => {
  res.json(Object.values(registeredDevices));
});

app.post('/api/register-device', (req, res) => {
  const { phone, name } = req.body;
  if (!phone) return res.status(400).json({ error: 'Número requerido' });
  const id = `TK-${phone.replace(/\D/g, '').slice(-6)}`;
  registeredDevices[id] = { id, phone, name: name || phone, registered: true, imei: null };
  res.json(registeredDevices[id]);
});

io.on('connection', (socket) => {
  socket.on('gps', (data) => {
    vehicles[data.id] = { ...data, updated: new Date().toISOString() };
    socket.emit('ack', { id: data.id });
  });
});

setInterval(() => {
  io.emit('vehicles', Object.values(vehicles));
}, 2000);

// Simulador
const SIM = [
  { id: 'Veh-001', lat: 19.4326, lng: -99.1332, angle: 0 },
  { id: 'Veh-002', lat: 19.4200, lng: -99.1500, angle: 90 },
  { id: 'Veh-003', lat: 19.4450, lng: -99.1200, angle: 180 },
  { id: 'Veh-004', lat: 19.4100, lng: -99.1450, angle: 270 },
  { id: 'Veh-005', lat: 19.4380, lng: -99.1100, angle: 45 },
];

setInterval(() => {
  for (const v of SIM) {
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

// ===== TK103 TCP Server (GT06 Protocol) =====

function bcdToInt(b0, b1, b2, b3) {
  return (((b0 >> 4) & 0xF) * 10000000) + ((b0 & 0xF) * 1000000) +
         (((b1 >> 4) & 0xF) * 100000) + ((b1 & 0xF) * 10000) +
         (((b2 >> 4) & 0xF) * 1000) + ((b2 & 0xF) * 100) +
         (((b3 >> 4) & 0xF) * 10) + (b3 & 0xF);
}

function parseLocation(b0, b1, b2, b3, isLongitude) {
  const raw = bcdToInt(b0, b1, b2, b3);
  if (raw === 0) return 0;
  const divisor = isLongitude ? 1000 : 10000;
  const val = raw / divisor;
  return Math.floor(val / 100) + (val % 100) / 60;
}

function xorChecksum(buf, start, end) {
  let cs = 0;
  for (let i = start; i < end; i++) cs ^= buf[i];
  return cs;
}

function makeAck(serial, protocol) {
  const header = Buffer.from([0x78, 0x78, 0x05, (serial >> 8) & 0xFF, serial & 0xFF, protocol]);
  const cs = xorChecksum(header, 2, header.length);
  return Buffer.concat([header, Buffer.from([cs, 0x0D, 0x0A])]);
}

function imeiFromBcd(b0, b1, b2, b3, b4, b5, b6, b7) {
  const bytes = [b0, b1, b2, b3, b4, b5, b6, b7];
  return bytes.map(b => {
    const hi = (b >> 4) & 0xF;
    const lo = b & 0xF;
    return hi.toString() + lo.toString();
  }).join('');
}

const tk103Server = net.createServer((socket) => {
  let buf = Buffer.alloc(0);
  let deviceImei = null;

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    while (buf.length >= 7) {
      const start = buf.indexOf(Buffer.from([0x78, 0x78]));
      if (start === -1) break;
      if (start > 0) { buf = buf.slice(start); continue; }

      const packetLen = buf[2];
      const totalLen = 2 + 1 + packetLen + 2;
      if (buf.length < totalLen) break;

      const pkt = buf.slice(0, totalLen);
      buf = buf.slice(totalLen);

      const serial = pkt.readUInt16BE(3);
      const proto = pkt[5];

      try {
        switch (proto) {
          case 0x01: {
            deviceImei = imeiFromBcd(pkt[6], pkt[7], pkt[8], pkt[9], pkt[10], pkt[11], pkt[12], pkt[13]);
            const reg = Object.values(registeredDevices).find(d => d.imei === deviceImei);
            const phone = reg ? reg.phone : 'Desconocido';
            console.log(`[TK103] Conectado: ${deviceImei} (${phone})`);
            socket.write(makeAck(serial, 0x01));
            break;
          }

          case 0x12: {
            if (!deviceImei) break;
            const latVal = parseLocation(pkt[12], pkt[13], pkt[14], pkt[15], false);
            const ns = pkt[16];
            const lngVal = parseLocation(pkt[17], pkt[18], pkt[19], pkt[20], true);
            const ew = pkt[21];
            const speed = pkt[22];
            const status = pkt[25];
            const lat = ns === 1 ? -latVal : latVal;
            const lng = ew === 1 ? -lngVal : lngVal;

            vehicles[deviceImei] = {
              id: deviceImei,
              type: 'tk103',
              phone: registeredDevices[deviceImei]?.phone || '—',
              name: registeredDevices[deviceImei]?.name || deviceImei,
              lat: Math.round(lat * 1e6) / 1e6,
              lng: Math.round(lng * 1e6) / 1e6,
              speed: Math.round(speed * 10) / 10,
              ignition: speed > 1,
              updated: new Date().toISOString()
            };
            socket.write(makeAck(serial, 0x12));
            break;
          }

          case 0x13: {
            socket.write(makeAck(serial, 0x13));
            break;
          }
        }
      } catch (e) {
        console.error('[TK103] Error:', e.message);
      }
    }
  });

  socket.on('error', () => {});
  socket.on('close', () => {
    if (deviceImei) console.log(`[TK103] Desconectado: ${deviceImei}`);
  });
});

tk103Server.listen(TCP_PORT, () => {
  console.log(`[TK103] Servidor TCP en puerto ${TCP_PORT}`);
});

server.listen(PORT, () => {
  console.log(`[HTTP] GPS Tracker en http://localhost:${PORT}`);
});
