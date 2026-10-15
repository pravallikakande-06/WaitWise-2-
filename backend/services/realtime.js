// Thin wrapper around Socket.IO so the rest of the code never touches the server object.
let io = null;
module.exports = {
  init: (server) => { io = server; },
  broadcast: () => io && io.emit('queue:changed'),            // clients re-fetch their data
  toUser: (id, event, payload) => io && io.to(`user:${id}`).emit(event, payload),
};
