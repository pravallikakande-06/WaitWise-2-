require('dotenv').config({ path: '../.env' });
const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

for (const key of ['MONGO_URI', 'JWT_SECRET']) {
  if (!process.env[key]) { console.error(`Missing ${key}. Copy .env.example to .env first.`); process.exit(1); }
}

const app = require('./app');
const realtime = require('./services/realtime');
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN } });

// Only logged-in users may connect; each gets a private room for personal notifications.
io.use((socket, next) => {
  try { socket.userId = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET).id; next(); }
  catch { next(new Error('unauthorized')); }
});
io.on('connection', (socket) => socket.join(`user:${socket.userId}`));
realtime.init(io);

mongoose.connect(process.env.MONGO_URI)
  .then(() => server.listen(process.env.PORT || 5000, () => console.log('WaitWise API + live updates running')))
  .catch((e) => { console.error('Database connection failed:', e.message); process.exit(1); });
