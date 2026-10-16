// Resets the database to the demo data: npm run seed
const { db, seed } = require('./db');

db.pragma('foreign_keys = OFF');
db.exec(`
  DELETE FROM transactions;
  DELETE FROM consumer_requests;
  DELETE FROM solar_listings;
  DELETE FROM users;
  DELETE FROM sqlite_sequence;
`);
db.pragma('foreign_keys = ON');
seed();
console.log('Demo data restored. Login: producer@demo.com / consumer@demo.com / government@demo.com (password: demo123)');