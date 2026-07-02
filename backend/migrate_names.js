const { Client } = require("pg");
const { getDbConfig } = require("./db");

async function runMigration() {
  const client = new Client(getDbConfig());
  try {
    await client.connect();
    console.log("Connected to Neon PostgreSQL");

    await client.query("BEGIN");

    console.log("Migrating tourists table...");
    await client.query("ALTER TABLE tourists ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)");
    
    // Check if `name` exists to avoid errors
    const nameCheck = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'tourists' AND column_name = 'name'");
    if (nameCheck.rows.length > 0) {
      await client.query("UPDATE tourists SET full_name = COALESCE(full_name, tourist_name, name)");
      await client.query("ALTER TABLE tourists DROP COLUMN IF EXISTS name");
    } else {
      await client.query("UPDATE tourists SET full_name = COALESCE(full_name, tourist_name)");
    }
    await client.query("ALTER TABLE tourists DROP COLUMN IF EXISTS tourist_name");
    
    console.log("Migrating incidents table...");
    await client.query("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)");
    await client.query("UPDATE incidents SET full_name = COALESCE(full_name, tourist_name)");
    // Preserving tourist_name in incidents per user request

    console.log("Migrating ai_alerts table...");
    await client.query("ALTER TABLE ai_alerts ADD COLUMN IF NOT EXISTS full_name VARCHAR(100)");
    await client.query("UPDATE ai_alerts SET full_name = COALESCE(full_name, tourist_name)");
    // Preserving tourist_name in ai_alerts per user request

    await client.query("COMMIT");
    console.log("Migration completed successfully.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
  } finally {
    await client.end();
  }
}

runMigration();
