const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { db } = require('./db');

const app = express();
const SECRET = process.env.JWT_SECRET || 'solarshare-demo-secret';
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const clean = (v) => String(v ?? '').trim();

// ---------- Authentication middleware ----------
function auth(role) {
  return (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const payload = jwt.verify(token, SECRET);
      const user = db.prepare('SELECT id,name,email,phone,location,role FROM users WHERE id=?').get(payload.id);
      if (!user) return bad(res, 'Please log in again.', 401);
      if (role && user.role !== role) return bad(res, `Only ${role}s can use this feature.`, 403);
      req.user = user;
      next();
    } catch (e) {
      bad(res, 'Please log in first.', 401);
    }
  };
}
const makeToken = (u) => jwt.sign({ id: u.id }, SECRET, { expiresIn: '1d' });

// ---------- Auth routes ----------
app.post('/api/auth/register', (req, res) => {
  const name = clean(req.body.name), email = clean(req.body.email).toLowerCase();
  const password = String(req.body.password || ''), phone = clean(req.body.phone);
  const location = clean(req.body.location), role = clean(req.body.role);

  if (!name || !email || !password || !location || !role) return bad(res, 'Please fill in all required fields.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Please enter a valid email address.');
  if (password.length < 6) return bad(res, 'Password must be at least 6 characters.');
  if (!['producer', 'consumer'].includes(role)) return bad(res, 'Please select Producer or Consumer.');
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return bad(res, 'This email is already registered.', 409);

  const id = db.prepare('INSERT INTO users (name,email,password,phone,location,role) VALUES (?,?,?,?,?,?)')
    .run(name, email, bcrypt.hashSync(password, 10), phone, location, role).lastInsertRowid;
  const user = db.prepare('SELECT id,name,email,phone,location,role FROM users WHERE id=?').get(id);
  res.json({ token: makeToken(user), user });
});

app.post('/api/auth/login', (req, res) => {
  const email = clean(req.body.email).toLowerCase(), password = String(req.body.password || '');
  if (!email || !password) return bad(res, 'Please enter email and password.');
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!row || !bcrypt.compareSync(password, row.password)) return bad(res, 'Invalid email or password.', 401);
  const { password: _pw, ...user } = row;
  res.json({ token: makeToken(user), user });
});

app.get('/api/me', auth(), (req, res) => res.json(req.user));

app.put('/api/me', auth(), (req, res) => {
  const name = clean(req.body.name), phone = clean(req.body.phone), location = clean(req.body.location);
  if (!name || !location) return bad(res, 'Name and location are required.');
  db.prepare('UPDATE users SET name=?, phone=?, location=? WHERE id=?').run(name, phone, location, req.user.id);
  res.json(db.prepare('SELECT id,name,email,phone,location,role FROM users WHERE id=?').get(req.user.id));
});

// ---------- Matching logic ----------
// 1) listing must be 'available'  2) surplus >= required energy
// 3) listings in the same location are ranked first, then smallest surplus first
function sameArea(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  return !!a && !!b && (a.includes(b) || b.includes(a));
}
function findListings(minEnergy, loc, onlyLocation) {
  let rows = db.prepare(`
    SELECT l.*, u.name AS producer_name, u.phone AS producer_phone
    FROM solar_listings l JOIN users u ON u.id = l.producer_id
    WHERE l.status = 'available' AND l.surplus_energy >= ?`).all(minEnergy);
  rows.forEach((r) => (r.same_location = sameArea(r.location, loc || '')));
  if (onlyLocation && loc) rows = rows.filter((r) => r.same_location);
  rows.sort((a, b) => b.same_location - a.same_location || a.surplus_energy - b.surplus_energy);
  return rows;
}

// ---------- Listings ----------
app.post('/api/listings', auth('producer'), (req, res) => {
  const generated = num(req.body.generated_energy), consumed = num(req.body.consumed_energy);
  const location = clean(req.body.location) || req.user.location;
  const status = clean(req.body.status) || 'available';
  if (isNaN(generated) || isNaN(consumed)) return bad(res, 'Please enter generated and consumed energy.');
  if (generated < 0 || consumed < 0) return bad(res, 'Energy values cannot be negative.');
  const surplus = Math.round((generated - consumed) * 100) / 100;
  if (surplus <= 0) return bad(res, 'You have no surplus energy (generated must be greater than consumed).');
  if (!['available', 'unavailable'].includes(status)) return bad(res, 'Invalid status.');
  const id = db.prepare(`INSERT INTO solar_listings (producer_id,generated_energy,consumed_energy,surplus_energy,location,status)
    VALUES (?,?,?,?,?,?)`).run(req.user.id, generated, consumed, surplus, location, status).lastInsertRowid;
  res.json(db.prepare('SELECT * FROM solar_listings WHERE id=?').get(id));
});

app.get('/api/listings/mine', auth('producer'), (req, res) => {
  res.json(db.prepare('SELECT * FROM solar_listings WHERE producer_id=? ORDER BY id DESC').all(req.user.id));
});

app.put('/api/listings/:id/status', auth('producer'), (req, res) => {
  const l = db.prepare('SELECT * FROM solar_listings WHERE id=? AND producer_id=?').get(req.params.id, req.user.id);
  if (!l) return bad(res, 'Listing not found.', 404);
  const status = clean(req.body.status);
  if (!['available', 'unavailable'].includes(status)) return bad(res, 'Invalid status.');
  if (status === 'available' && l.surplus_energy <= 0) return bad(res, 'This listing has no surplus left.');
  db.prepare('UPDATE solar_listings SET status=? WHERE id=?').run(status, l.id);
  res.json({ ok: true });
});

// Browse / filter available listings
app.get('/api/listings', auth(), (req, res) => {
  const min = req.query.min ? num(req.query.min) : 0;
  if (isNaN(min) || min < 0) return bad(res, 'Invalid minimum energy value.');
  res.json(findListings(min, clean(req.query.location), true));
});

// ---------- Consumer requirements + matching ----------
app.post('/api/requirements', auth('consumer'), (req, res) => {
  const required = num(req.body.required_energy);
  const location = clean(req.body.location) || req.user.location;
  if (isNaN(required)) return bad(res, 'Please enter the required energy in kWh.');
  if (required <= 0) return bad(res, 'Required energy must be greater than zero.');
  const id = db.prepare('INSERT INTO consumer_requests (consumer_id,required_energy,location) VALUES (?,?,?)')
    .run(req.user.id, required, location).lastInsertRowid;
  res.json({ id, matches: findListings(required, location, false) });
});

app.get('/api/matches', auth('consumer'), (req, res) => {
  const required = num(req.query.required);
  if (isNaN(required) || required <= 0) return bad(res, 'Required energy must be greater than zero.');
  res.json(findListings(required, clean(req.query.location), false));
});

// ---------- Requests (transactions) ----------
app.post('/api/requests', auth('consumer'), (req, res) => {
  const listingId = req.body.listing_id, energy = num(req.body.requested_energy);
  if (isNaN(energy)) return bad(res, 'Please enter the energy you need in kWh.');
  if (energy <= 0) return bad(res, 'Requested energy must be greater than zero.');
  const l = db.prepare('SELECT * FROM solar_listings WHERE id=?').get(listingId);
  if (!l) return bad(res, 'Listing not found.', 404);
  if (l.status !== 'available' || l.surplus_energy <= 0) return bad(res, 'This listing is no longer available.');
  if (energy > l.surplus_energy) return bad(res, `You requested more than available. Only ${l.surplus_energy} kWh is available.`);

  const run = db.transaction(() => {
    let reqId = Number(req.body.requirement_id);
    const own = reqId && db.prepare('SELECT id FROM consumer_requests WHERE id=? AND consumer_id=?').get(reqId, req.user.id);
    if (!own) {
      reqId = db.prepare('INSERT INTO consumer_requests (consumer_id,required_energy,location) VALUES (?,?,?)')
        .run(req.user.id, energy, req.user.location).lastInsertRowid;
    }
    db.prepare("UPDATE consumer_requests SET status='pending' WHERE id=?").run(reqId);
    return db.prepare(`INSERT INTO transactions (producer_id,consumer_id,listing_id,requirement_id,requested_energy)
      VALUES (?,?,?,?,?)`).run(l.producer_id, req.user.id, l.id, reqId, energy).lastInsertRowid;
  });
  res.json({ id: run() });
});

app.get('/api/requests/mine', auth('consumer'), (req, res) => {
  res.json(db.prepare(`
    SELECT t.*, u.name AS producer_name, u.phone AS producer_phone, l.location AS listing_location
    FROM transactions t JOIN users u ON u.id=t.producer_id JOIN solar_listings l ON l.id=t.listing_id
    WHERE t.consumer_id=? ORDER BY t.id DESC`).all(req.user.id));
});

app.get('/api/requests/incoming', auth('producer'), (req, res) => {
  res.json(db.prepare(`
    SELECT t.*, u.name AS consumer_name, u.phone AS consumer_phone, l.location AS listing_location
    FROM transactions t JOIN users u ON u.id=t.consumer_id JOIN solar_listings l ON l.id=t.listing_id
    WHERE t.producer_id=? ORDER BY t.id DESC`).all(req.user.id));
});

app.put('/api/requests/:id', auth('producer'), (req, res) => {
  const t = db.prepare('SELECT * FROM transactions WHERE id=? AND producer_id=?').get(req.params.id, req.user.id);
  if (!t) return bad(res, 'Request not found.', 404);
  const action = clean(req.body.action);

  const setStatus = (status) => {
    db.prepare('UPDATE transactions SET status=? WHERE id=?').run(status, t.id);
    if (t.requirement_id) db.prepare('UPDATE consumer_requests SET status=? WHERE id=?').run(status, t.requirement_id);
  };

  if (action === 'accept') {
    if (t.status !== 'pending') return bad(res, 'Only pending requests can be accepted.');
    const l = db.prepare('SELECT * FROM solar_listings WHERE id=?').get(t.listing_id);
    if (l.surplus_energy < t.requested_energy) return bad(res, 'Not enough surplus left in this listing.');
    db.transaction(() => {
      const left = Math.round((l.surplus_energy - t.requested_energy) * 100) / 100;
      db.prepare('UPDATE solar_listings SET surplus_energy=?, status=? WHERE id=?')
        .run(left, left <= 0 ? 'sold_out' : l.status, l.id);
      setStatus('accepted');
    })();
  } else if (action === 'reject') {
    if (t.status !== 'pending') return bad(res, 'Only pending requests can be rejected.');
    setStatus('rejected');
  } else if (action === 'complete') {
    if (t.status !== 'accepted') return bad(res, 'Only accepted requests can be completed.');
    setStatus('completed');
  } else return bad(res, 'Invalid action.');
  res.json({ ok: true });
});

// ---------- Dashboard ----------
app.get('/api/dashboard', auth(), (req, res) => {
  if (req.user.role === 'government') return res.json({ role: 'government' });
  if (req.user.role === 'producer') {
    const s = db.prepare(`SELECT COALESCE(SUM(generated_energy),0) AS generated, COALESCE(SUM(consumed_energy),0) AS consumed,
        COALESCE(SUM(CASE WHEN status='available' THEN surplus_energy END),0) AS surplus,
        COALESCE(SUM(status='available'),0) AS active
      FROM solar_listings WHERE producer_id=?`).get(req.user.id);
    const pending = db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE producer_id=? AND status='pending'").get(req.user.id).n;
    return res.json({ role: 'producer', ...s, pending });
  }
  const latest = db.prepare('SELECT * FROM consumer_requests WHERE consumer_id=? ORDER BY id DESC LIMIT 1').get(req.user.id);
  const count = (st) => db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE consumer_id=? AND status=?').get(req.user.id, st).n;
  res.json({
    role: 'consumer',
    required: latest ? latest.required_energy : 0,
    requirement_location: latest ? latest.location : req.user.location,
    matches: latest ? findListings(latest.required_energy, latest.location, false).length : 0,
    pending: count('pending'), accepted: count('accepted'), completed: count('completed'),
  });
});

// ---------- Insights: monitoring, estimated forecast, carbon wallet, alerts ----------
// Calculated from existing database records. Anything tagged "demo" is a clearly labelled
// sample value (no real IoT / battery hardware is connected).
const CO2_PER_KWH = 0.82; // kg CO2 per kWh – approximate grid emission factor (estimate only)
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Simple estimate (NOT a trained model): average of recent entries plus a geometrically fading trend
// when 3+ entries exist. Estimates are kept within the range of values already recorded.
function project(vals) {
  if (!vals.length) return null;
  const n = vals.length, avg = vals.reduce((a, b) => a + b, 0) / n, xm = (n - 1) / 2;
  const den = vals.reduce((s, _, i) => s + (i - xm) ** 2, 0);
  const slope = n >= 3 && den ? vals.reduce((s, v, i) => s + (i - xm) * (v - avg), 0) / den : 0;
  const last = avg + slope * (n - 1 - xm), top = Math.max(...vals);
  let fade = 0;
  return Array.from({ length: 7 }, (_, k) => {
    fade += 0.6 ** (k + 1);
    return r2(Math.min(top, Math.max(0, last + slope * fade)));
  });
}

app.get('/api/insights', auth(), (req, res) => {
  const u = req.user;
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const day = (s) => String(s || '').slice(5, 10);
  const card = (label, value, unit, icon) => ({ label, value: r2(value), unit, icon, tag: 'recorded' });
  const battery = (label) => ({ label, value: 72, unit: '%', icon: '🔋', tag: 'demo' });
  const out = { role: u.role, alerts: [], equipment: null };
  const warn = (text, demo) => out.alerts.push({ level: 'warn', text, demo });
  const info = (text) => out.alerts.push({ level: 'info', text });
  const shared = `SELECT t.requested_energy AS kwh, t.created_at, l.location FROM transactions t
    JOIN solar_listings l ON l.id=t.listing_id WHERE t.status='completed'`;
  let completed;

  if (u.role === 'producer') {
    const s = one(`SELECT COALESCE(SUM(generated_energy),0) g, COALESCE(SUM(consumed_energy),0) c,
      COALESCE(SUM(CASE WHEN status='available' THEN surplus_energy END),0) s FROM solar_listings WHERE producer_id=?`, u.id);
    out.cards = [card('Solar generation', s.g, 'kWh', '☀️'), card('Energy consumption', s.c, 'kWh', '🏠'),
      card('Available surplus', s.s, 'kWh', '⚡'), battery('Battery status')];
    const last = all('SELECT * FROM solar_listings WHERE producer_id=? ORDER BY id DESC LIMIT 6', u.id).reverse();
    out.chart = { title: 'Generated vs consumed per entry (kWh)', names: ['Generated', 'Consumed'],
      rows: last.map((l) => ({ label: `${day(l.created_at)} #${l.id}`, a: l.generated_energy, b: l.consumed_energy })) };
    const f = last.slice(-5);
    out.forecast = { title: 'Estimated generation (kWh/day)', values: project(f.map((l) => l.generated_energy)),
      basis: `Based on your last ${f.length} listing entr${f.length === 1 ? 'y' : 'ies'} (each entry treated as one day)` };
    const pending = one("SELECT COUNT(*) n FROM transactions WHERE producer_id=? AND status='pending'", u.id).n;
    const off = one("SELECT COUNT(*) n FROM solar_listings WHERE producer_id=? AND status='unavailable'", u.id).n;
    if (pending) warn(`${pending} consumer request(s) are waiting for your response.`);
    if (off) info(`${off} of your listings are marked unavailable.`);
    if (!last.length) info('Add your first surplus entry to start monitoring and forecasting.');
    warn('Solar panel cleaning recommended (sample maintenance alert).', true);
    out.equipment = [
      { name: 'Solar panel array', status: 'Operational', ok: true, note: 'Cleaning due soon' },
      { name: 'Inverter', status: 'Operational', ok: true, note: 'No faults reported' },
      { name: 'Battery bank', status: 'Needs attention', ok: false, note: 'Capacity check due' },
    ];
    completed = all(shared + ' AND t.producer_id=? ORDER BY t.id DESC', u.id);
  } else if (u.role === 'consumer') {
    const g = one('SELECT COALESCE(SUM(generated_energy),0) n FROM solar_listings').n;
    const av = one("SELECT COALESCE(SUM(surplus_energy),0) n FROM solar_listings WHERE status='available'").n;
    const rq = one("SELECT COALESCE(SUM(requested_energy),0) n FROM transactions WHERE consumer_id=? AND status!='rejected'", u.id).n;
    out.cards = [card('Community solar generation', g, 'kWh', '☀️'), card('Energy you requested', rq, 'kWh', '🏠'),
      card('Available surplus', av, 'kWh', '⚡'), battery('Home battery')];
    const tx = all('SELECT * FROM transactions WHERE consumer_id=? ORDER BY id DESC LIMIT 6', u.id).reverse();
    out.chart = { title: 'Your requested energy per request (kWh)', names: ['Requested'],
      rows: tx.map((t) => ({ label: `${day(t.created_at)} #${t.id}`, a: t.requested_energy })) };
    const rq5 = all('SELECT required_energy FROM consumer_requests WHERE consumer_id=? ORDER BY id DESC LIMIT 5', u.id).reverse();
    out.forecast = { title: 'Estimated energy need (kWh/day)', values: project(rq5.map((r) => r.required_energy)),
      basis: `Based on your last ${rq5.length} requirement entr${rq5.length === 1 ? 'y' : 'ies'}` };
    const cnt = (st) => one('SELECT COUNT(*) n FROM transactions WHERE consumer_id=? AND status=?', u.id, st).n;
    if (cnt('pending')) info(`${cnt('pending')} request(s) are waiting for a producer to respond.`);
    if (cnt('accepted')) warn(`${cnt('accepted')} accepted request(s) — contact the producer to complete the sharing.`);
    if (!one('SELECT COUNT(*) n FROM consumer_requests WHERE consumer_id=?', u.id).n) info('No energy requirement yet. Use Find Energy to create one.');
    completed = all(shared + ' AND t.consumer_id=? ORDER BY t.id DESC', u.id);
  } else {
    const s = one(`SELECT COUNT(*) n, COALESCE(SUM(generated_energy),0) g, COALESCE(SUM(consumed_energy),0) c,
      COALESCE(SUM(CASE WHEN status='available' THEN surplus_energy END),0) av,
      COALESCE(SUM(status='available'),0) active, COALESCE(SUM(status='sold_out'),0) soldout FROM solar_listings`);
    const locs = all(`SELECT MIN(location) location, COUNT(*) listings, SUM(generated_energy) generated, SUM(consumed_energy) consumed,
      SUM(CASE WHEN status='available' THEN surplus_energy ELSE 0 END) available
      FROM solar_listings GROUP BY lower(trim(location)) ORDER BY generated DESC`);
    completed = all(shared + ' ORDER BY t.id DESC');
    const tc = (st) => one('SELECT COUNT(*) n FROM transactions WHERE status=?', st).n;
    out.cards = [card('Community generation (recorded)', s.g, 'kWh', '☀️'), card('Community consumption (recorded)', s.c, 'kWh', '🏠'),
      card('Available surplus', s.av, 'kWh', '⚡'), battery('Community storage')];
    out.chart = { title: 'Generation vs consumption by location (kWh)', names: ['Generated', 'Consumed'],
      rows: locs.slice(0, 6).map((l) => ({ label: l.location, a: l.generated, b: l.consumed })) };
    out.forecast = { title: 'Estimated community surplus (kWh/day)', values: s.n ? project([s.av]) : null,
      basis: 'Holds the currently available community surplus constant' };
    out.community = {
      producers: one("SELECT COUNT(*) n FROM users WHERE role='producer'").n,
      consumers: one("SELECT COUNT(*) n FROM users WHERE role='consumer'").n,
      active: s.active, pending: tc('pending'), completed: completed.length,
      locations: locs.map((l) => ({ ...l, generated: r2(l.generated), consumed: r2(l.consumed), available: r2(l.available) })),
      recent: all(`SELECT t.created_at, t.requested_energy, t.status, l.location FROM transactions t
        JOIN solar_listings l ON l.id=t.listing_id ORDER BY t.id DESC LIMIT 8`),
    };
    if (tc('pending')) info(`${tc('pending')} energy-sharing request(s) are pending across the community.`);
    const open = one("SELECT COUNT(*) n FROM consumer_requests WHERE status='open'").n;
    if (open) info(`${open} consumer requirement(s) are still open (no request sent yet).`);
    if (s.soldout) info(`${s.soldout} listing(s) are fully sold out.`);
  }

  const kwh = r2(completed.reduce((a, c) => a + c.kwh, 0));
  out.carbon = completed.length
    ? { sample: false, kwh, kg: r2(kwh * CO2_PER_KWH), trees: r2((kwh * CO2_PER_KWH) / 21), records: completed.length,
        history: completed.slice(0, 8).map((c) => ({ date: c.created_at, location: c.location, kwh: c.kwh, kg: r2(c.kwh * CO2_PER_KWH) })) }
    : { sample: true, kwh: 25, kg: r2(25 * CO2_PER_KWH), trees: r2((25 * CO2_PER_KWH) / 21), records: 0, history: [] };
  out.carbon.factor = CO2_PER_KWH;
  res.json(out);
});

// ---------- Error handling ----------
app.use('/api', (req, res) => bad(res, 'API route not found.', 404));
app.use((err, req, res, next) => {
  console.error(err);
  bad(res, 'Server error. Please check your input and try again.', 500);
});

app.listen(PORT, () => console.log(`SolarShare running at http://localhost:${PORT}`));