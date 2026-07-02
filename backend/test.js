const { pool } = require('./db');
pool.query("INSERT INTO tourists (id, full_name, email, password_hash) VALUES ('1', 'Kapil Bhandari', 'kapil@example.com', 'pass')")
  .then(() => { console.log('Inserted'); process.exit(0); })
  .catch(console.error);
