const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'tsms_db', password: 'kapil123', port: 5432 });

async function fixUser() {
  const hash = await bcrypt.hash('kapil123', 10);
  await pool.query("UPDATE tourists SET password_hash = $1 WHERE id = 'TSMS-8970'", [hash]);
  console.log('Fixed password in DB for TSMS-8970');
  pool.end();
}
fixUser();
