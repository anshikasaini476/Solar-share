const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'solarshare.db'));
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT,
  location TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('producer','consumer','government')),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS solar_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producer_id INTEGER NOT NULL REFERENCES users(id),
  generated_energy REAL NOT NULL,
  consumed_energy REAL NOT NULL,
  surplus_energy REAL NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','unavailable','sold_out')),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS consumer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consumer_id INTEGER NOT NULL REFERENCES users(id),
  required_energy REAL NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','pending','accepted','rejected','completed')),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producer_id INTEGER NOT NULL REFERENCES users(id),
  consumer_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER NOT NULL REFERENCES solar_listings(id),
  requirement_id INTEGER REFERENCES consumer_requests(id),
  requested_energy REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','completed')),
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

// Migration: older databases only allow 'producer'/'consumer' roles. Rebuild the users table once
// (data is copied unchanged) so the new 'government' role is accepted.
const usersDdl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
if (usersDdl && !usersDdl.sql.includes("'government'")) {
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(usersDdl.sql
      .replace(/CREATE TABLE (IF NOT EXISTS )?"?users"?/, 'CREATE TABLE users_new')
      .replace("('producer','consumer')", "('producer','consumer','government')"));
    db.exec('INSERT INTO users_new (id,name,email,password,phone,location,role,created_at) SELECT id,name,email,password,phone,location,role,created_at FROM users');
    db.exec('DROP TABLE users; ALTER TABLE users_new RENAME TO users;');
  })();
  db.pragma('foreign_keys = ON');
}

// Demo Government account (read-only aggregate view). Added if missing.
function ensureGov() {
  if (!db.prepare("SELECT id FROM users WHERE email='government@demo.com'").get()) {
    db.prepare('INSERT INTO users (name,email,password,phone,location,role) VALUES (?,?,?,?,?,?)')
      .run('District Energy Office', 'government@demo.com', bcrypt.hashSync('demo123', 10), '9876500021', 'Ghaziabad', 'government');
  }
}

function seed() {
  const hash = bcrypt.hashSync('demo123', 10);
  const addUser = db.prepare(
    'INSERT INTO users (name,email,password,phone,location,role) VALUES (?,?,?,?,?,?)'
  );
  const addListing = db.prepare(
    'INSERT INTO solar_listings (producer_id,generated_energy,consumed_energy,surplus_energy,location,status) VALUES (?,?,?,?,?,?)'
  );
  const addReq = db.prepare(
    'INSERT INTO consumer_requests (consumer_id,required_energy,location,status) VALUES (?,?,?,?)'
  );

  const p1 = addUser.run('Amit Sharma', 'producer@demo.com', hash, '9876500001', 'Ghaziabad', 'producer').lastInsertRowid;
  const p2 = addUser.run('Neha Verma', 'producer2@demo.com', hash, '9876500002', 'Noida', 'producer').lastInsertRowid;
  const p3 = addUser.run('Rahul Singh', 'producer3@demo.com', hash, '9876500003', 'Delhi', 'producer').lastInsertRowid;
  const c1 = addUser.run('Priya Gupta', 'consumer@demo.com', hash, '9876500011', 'Ghaziabad', 'consumer').lastInsertRowid;
  addUser.run('Karan Mehta', 'consumer2@demo.com', hash, '9876500012', 'Noida', 'consumer');

  addListing.run(p1, 10, 6, 4, 'Ghaziabad', 'available');   // 10 - 6 = 4 kWh
  addListing.run(p2, 8, 3, 5, 'Noida', 'available');
  addListing.run(p3, 12, 4, 8, 'Delhi', 'available');
  addReq.run(c1, 3, 'Ghaziabad', 'open');                   // needs 3 kWh
  ensureGov();
}

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) seed();
ensureGov();

module.exports = { db, seed };