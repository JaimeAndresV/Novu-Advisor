const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { createSchema } = require("./schema");

const dbPathFromEnv = process.env.DB_PATH || "./data/novu.db";
const absoluteDbPath = path.resolve(process.cwd(), dbPathFromEnv);
const dbDir = path.dirname(absoluteDbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(absoluteDbPath);

db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("temp_store = MEMORY");
db.pragma("foreign_keys = ON");

createSchema(db);

module.exports = db;
