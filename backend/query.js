const { pool } = require('./db');
pool.query("SELECT * FROM tourists WHERE id = 'TSMS-8970'", (err, res) => {
  if (err) console.error(err);
  else console.log(res.rows);
  pool.end();
});
