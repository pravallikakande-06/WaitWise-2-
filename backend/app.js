const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const realtime = require('./services/realtime');

const app = express();
const limit = (max) => rateLimit({
  windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', message: { message: 'Too many requests. Please try again later.' },
});

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', limit(1500));
app.use(['/api/auth/login', '/api/auth/register'], limit(20)); // slow down password guessing
// After any successful change, tell connected clients to refresh their queue data.
app.use('/api', (req, res, next) => {
  res.on('finish', () => { if (req.method !== 'GET' && res.statusCode < 400) realtime.broadcast(); });
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/api'));
app.use((req, res) => res.status(404).json({ message: 'Not found.' }));

module.exports = app;
