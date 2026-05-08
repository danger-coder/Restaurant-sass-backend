/**
 * Socket.io singleton – initialised once in server.js, imported anywhere to emit events.
 *
 * Rooms:
 *   owner_<ownerId>   – all authenticated staff/owners of that restaurant
 *   order_<orderId>   – public room so customers can track their order live
 *
 * Events (server → client):
 *   new_order             { order }
 *   order_status_changed  { orderId, orderNumber, status }
 *   menu_updated          { action: 'create'|'update'|'delete', type: 'item'|'category', item?, itemId? }
 *
 * Events (client → server):
 *   track_order  orderId  – customer joins the order room for live updates
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

function init(httpServer, allowedOrigins) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Middleware – verify JWT for staff/owner connections; public customers pass through unauthenticated
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        socket.ownerId = decoded.ownerId || decoded.userId;
        socket.role = decoded.role || 'owner';
      } catch {
        // Invalid token – treat as anonymous (customer)
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    // Authenticated staff/owner: auto-join their restaurant room
    if (socket.ownerId) {
      socket.join(`owner_${socket.ownerId}`);
    }

    // Customer order tracking: join the specific order room
    socket.on('track_order', (orderId) => {
      if (orderId && typeof orderId === 'string' && orderId.length < 100) {
        socket.join(`order_${orderId}`);
      }
    });
  });

  console.log('⚡ Socket.io initialised');
  return io;
}

/** Emit an event to all sockets in a restaurant owner's room */
function emitToOwner(ownerId, event, data) {
  if (!io) return;
  io.to(`owner_${ownerId}`).emit(event, data);
}

/** Emit an event to the specific order room (customer tracking) */
function emitToOrder(orderId, event, data) {
  if (!io) return;
  io.to(`order_${String(orderId)}`).emit(event, data);
}

function getIO() {
  return io;
}

module.exports = { init, getIO, emitToOwner, emitToOrder };
