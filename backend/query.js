const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'tsms_db', password: 'kapil123', port: 5432 });
pool.query("SELECT * FROM tourists WHERE id = 'TSMS-8970'", (err, res) => {
  if (err) console.error(err);
  else console.log(res.rows);
  pool.end();
});
