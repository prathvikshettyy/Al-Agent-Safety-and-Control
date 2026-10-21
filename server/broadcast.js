import { WebSocketServer } from 'ws';

let wss = null;

export function initWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws/feed' });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Send initial connection ack
    try {
      ws.send(JSON.stringify({
        type: 'connected',
        data: { message: 'AgentGuard Real-Time Gateway Feed Connected', ts: new Date().toISOString() }
      }));
    } catch (e) {
      console.error('Error sending initial WS message:', e);
    }
  });

  // Heartbeat ping interval
  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

export function broadcast(type, data) {
  if (!wss) return;

  const message = JSON.stringify({
    type,
    data,
    ts: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      try {
        client.send(message);
      } catch (err) {
        console.error('Error broadcasting WS message:', err);
      }
    }
  });
}
