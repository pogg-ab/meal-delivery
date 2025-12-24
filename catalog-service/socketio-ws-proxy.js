// socketio-ws-proxy.js (fixed: join runs on connect)
const { io } = require("socket.io-client");
const WebSocket = require("ws");

const SOCKETIO_URL = "http://localhost:3006/orders"; // your server + namespace
const SOCKETIO_PATH = "/socket.io";
const WS_PORT = 4000;

// configure the IDs you want the proxy to join
const restaurantsToListen = ["abfec637-5fdc-440c-9ba3-3dcecd1bd11e"];
const ordersToListen = ["990b4d65-6d97-4f00-92d9-de22fc0de9e2"]; // add order ids like "order-123" if needed

console.log("Proxy starting. Will connect to:", SOCKETIO_URL, "with path:", SOCKETIO_PATH);

const socket = io(SOCKETIO_URL, {
  path: SOCKETIO_PATH,
  transports: ["polling", "websocket"],
  reconnection: true,
  timeout: 10000
});

socket.on("connect", async () => {
  console.log("✅ Socket.IO connected as client:", socket.id, "transport:", socket.io.engine.transport.name);

  // Join rooms (and log ack)
  for (const r of restaurantsToListen) {
    socket.emit("joinRestaurant", { restaurantId: r }, (ack) => {
      console.log("proxy joinRestaurant", r, "ack:", ack);
    });
  }

  for (const o of ordersToListen) {
    socket.emit("joinOrder", { orderId: o }, (ack) => {
      console.log("proxy joinOrder", o, "ack:", ack);
    });
  }
});

socket.on("connect_error", (err) => {
  console.error("⛔ connect_error:", err && (err.message || err));
});

socket.on("error", (err) => console.error("socket error:", err));
socket.on("disconnect", (reason) => console.log("Socket.IO disconnected:", reason));
socket.on("reconnect_attempt", (n) => console.log("reconnect_attempt", n));

const eventsToForward = ["order.created", "order.updated", "order.owner_response"];
eventsToForward.forEach((ev) => {
  socket.on(ev, (payload) => {
    const message = JSON.stringify({ event: ev, payload, ts: Date.now() });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
    console.log("[PROXY] Forwarded", ev, "payload:", payload);
  });
});

// Plain WebSocket server for Postman
const wss = new WebSocket.Server({ port: WS_PORT }, () => {
  console.log(`Plain WebSocket server listening on ws://localhost:${WS_PORT}`);
});

wss.on("connection", (ws) => {
  console.log("Plain WS client connected");
  ws.send(JSON.stringify({ welcome: "connected to socketio-ws-proxy" }));
  ws.on("close", () => console.log("Plain WS client disconnected"));
  ws.on("message", (m) => console.log("WS client -> proxy:", m.toString()));
});
