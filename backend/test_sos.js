fetch('http://localhost:3001/api/sos', {
  method: 'POST', 
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ touristId: '1', incidentType: 'Medical Emergency', location: 'Lobby' })
})
  .then(r => r.text())
  .then(console.log);
