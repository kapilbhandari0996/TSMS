const { Client } = require('pg');
const { getDbConfig } = require('./db');
(async () => {
  const client = new Client(getDbConfig());
  try {
    await client.connect();
    const tourists = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='tourists' ORDER BY ordinal_position");
    const incidents = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='incidents' ORDER BY ordinal_position");
    console.log('tourists', tourists.rows);
    console.log('incidents', incidents.rows);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
