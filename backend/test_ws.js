const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected to WS');
  // Trigger SOS via fetch
  fetch('http://localhost:3001/api/sos', {
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ touristId: '1', incidentType: 'Medical Emergency', location: 'Lobby' })
  }).then(r => r.json()).then(console.log);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('WS MSG:', msg.type, msg.incident ? msg.incident.id : '');
  if (msg.type === 'sos_triggered') {
    process.exit(0);
  }
});
