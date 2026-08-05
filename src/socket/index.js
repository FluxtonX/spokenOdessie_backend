const { Server } = require("socket.io");

let ioInstance = null;

const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  ioInstance = io;

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join:user_room", (userId) => {
      if (userId) {
        socket.join(`user:${userId}`);
        console.log(`Socket ${socket.id} joined room user:${userId}`);
      }
    });

    socket.on("join:memory_room", (memoryId) => {
      if (memoryId) {
        socket.join(`memory:${memoryId}`);
        console.log(`Socket ${socket.id} joined room memory:${memoryId}`);
      }
    });

    socket.on("leave:memory_room", (memoryId) => {
      if (memoryId) {
        socket.leave(`memory:${memoryId}`);
        console.log(`Socket ${socket.id} left room memory:${memoryId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const sendNotificationToUser = (userId, notificationData) => {
  if (ioInstance && userId) {
    ioInstance.to(`user:${userId}`).emit("notification:new", notificationData);
    console.log(`Pushed real-time notification to user:${userId}`, notificationData.title);
  }
};

const sendMemoryEvent = (memoryId, eventName, data) => {
  if (ioInstance && memoryId) {
    // Broadcast to specific memory room AND emit to all connected clients for active modals
    ioInstance.to(`memory:${memoryId}`).emit(eventName, data);
    ioInstance.emit(eventName, data);
    console.log(`Broadcasted memory event ${eventName} for memory:${memoryId}`);
  }
};

module.exports = {
  initializeSocket,
  sendNotificationToUser,
  sendMemoryEvent,
};
