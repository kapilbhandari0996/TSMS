const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function fixUser() {
  const hash = await bcrypt.hash('kapil123', 10);
  await pool.query("UPDATE tourists SET password_hash = $1 WHERE id = 'TSMS-8970'", [hash]);
  console.log('Fixed password in DB for TSMS-8970');
  pool.end();
}
fixUser();
