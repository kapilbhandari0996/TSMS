const { Client } = require('pg');
const { getDbConfig } = require('./db');
const { decrypt } = require('./cryptoUtils');
(async () => {
  const client = new Client(getDbConfig());
  await client.connect();
  const res = await client.query('SELECT id, email FROM tourists');
  let targetId = null;
  for (let row of res.rows) {
    if (row.email && decrypt(row.email) === 'kapil@gmail.com') {
      targetId = row.id;
      break;
    }
  }
  if (targetId) {
    const updateRes = await client.query("UPDATE tourists SET password_hash = $1 WHERE id = $2", ['kapil123', targetId]);
    console.log('Kapil tourist updated:', updateRes.rowCount);
  } else {
    console.log('Kapil tourist not found.');
  }
  process.exit(0);
})();
