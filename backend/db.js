const { Pool } = require("pg");

function isProductionEnvironment() {
  return ["production", "staging"].includes((process.env.NODE_ENV || "").toLowerCase()) ||
    process.env.RENDER === "true" ||
    process.env.VERCEL === "1" ||
    process.env.VERCEL === "true";
}

function getLocalFallbackConfig() {
  return {
    host: "localhost",
    user: "postgres",
    password: "kapil123",
    database: "tsms_db",
    port: 5432,
  };
}

function parseDatabaseUrl(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || undefined,
    };
  } catch (error) {
    console.error("[DB] Invalid DATABASE_URL format:", error.message);
    return null;
  }
}

function buildDbConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING;
  const isProd = isProductionEnvironment();
  const envConfig = {
    host: process.env.DB_HOST || process.env.PGHOST || (isProd ? undefined : "localhost"),
    user: process.env.DB_USER || process.env.PGUSER || (isProd ? undefined : "postgres"),
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || (isProd ? undefined : "kapil123"),
    database: process.env.DB_NAME || process.env.PGDATABASE || (isProd ? undefined : "tsms_db"),
    port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
  };

  const hasEnvConfig = Object.values(envConfig).some((value) => Boolean(value) && value !== "");

  let config = {};
  if (connectionString) {
    const parsed = parseDatabaseUrl(connectionString);
    config = parsed ? { connectionString, ...parsed, password: parsed.password || "" } : { connectionString, password: "" };
  } else if (hasEnvConfig) {
    config = { ...envConfig };
    if (config.port) {
      config.port = Number(config.port);
    }
  } else if (!isProd) {
    config = { ...envConfig };
    console.log("[DB] No DATABASE_URL or DB_* values detected. Using local PostgreSQL defaults for development.");
  } else {
    console.error("[DB] Missing DATABASE_URL in production. Set DATABASE_URL (or DB_HOST/DB_USER/DB_NAME/DB_PASSWORD) before starting the backend.");
    process.exit(1);
  }

  if (!connectionString && !hasEnvConfig && !isProd) {
    config = getLocalFallbackConfig();
  }

  config.ssl = isProd ? { rejectUnauthorized: false } : false;

  return config;
}

const dbConfig = buildDbConfig();
const pool = new Pool(dbConfig);

pool.on("connect", () => {
  console.log("[DB] Connected to PostgreSQL database.");
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected database error:", err);
});

module.exports = {
  pool,
  getDbConfig: () => ({ ...dbConfig }),
  createPool: (config = dbConfig) => new Pool(config),
};
