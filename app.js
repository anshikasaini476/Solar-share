const app = document.getElementById('app');
let user = JSON.parse(localStorage.getItem('user') || 'null');
const token = () => localStorage.getItem('token');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const badge = (s) => `<span class="badge ${esc(s)}">${esc(s.replace('_', ' '))}</span>`;
const fmt = (n) => Math.round(Number(n) * 100) / 100;

async function api(url, method = 'GET', body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token()) logout();
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

function msg(text, type = 'error') {
  const el = document.getElementById('msg');
  el.className = 'alert ' + type;
  el.textContent = text;
  el.style.display = 'block';
  window.scrollTo(0, 0);
  clearTimeout(msg.t);
  msg.t = setTimeout(() => (el.style.display = 'none'), 5000);
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  user = null;
  location.hash = '#/login';
  renderNav();
}

function saveSession(data) {
  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));
  user = data.user;
}

// ---------- Navigation ----------
const ROLE = { producer: 'Farmer', consumer: 'Consumer', government: 'Government' };
const common = [['carbon', '🌿', 'Carbon Wallet'], ['analytics', '📈', 'Analytics & Alerts'], ['profile', '👤', 'Profile']];
const NAV = {
  producer: [['dashboard', '📊', 'Dashboard'], ['add-surplus', '➕', 'Add Surplus'], ['listings', '🔎', 'Available Surplus'], ['requests', '📥', 'Consumer Requests'], ...common],
  consumer: [['dashboard', '📊', 'Dashboard'], ['listings', '🔎', 'Find Energy'], ['requests', '📤', 'My Requests'], ...common],
  government: [['dashboard', '🏛️', 'Overview'], ['listings', '🔎', 'Community Listings'], ...common],
};
function renderNav() {
  const cur = location.hash.replace('#/', '') || 'home';
  document.body.classList.toggle('authed', !!user);
  const close = "document.body.classList.remove('menu-open');document.getElementById('links').classList.remove('open')";
  const link = (p, t, ic) => `<a href="#/${p}" class="${cur === p ? 'active' : ''}" onclick="${close}">${ic ? `<span class="ic">${ic}</span>` : ''}${t}</a>`;
  document.getElementById('links').innerHTML = user ? '' : link('home', 'Home') + link('about', 'About') + link('login', 'Login') + link('register', 'Register');
  document.getElementById('sidebar').innerHTML = !user ? '' :
    `<a class="side-brand" href="#/dashboard" style="padding:4px 10px">☀ SolarShare</a><div class="side-role">${ROLE[user.role] || user.role} · ${esc(user.name)}</div>` +
    (NAV[user.role] || NAV.consumer).map(([p, ic, t]) => link(p, t, ic)).join('') +
    `<a href="#" class="logout" onclick="logout();return false"><span class="ic">🚪</span>Logout</a>`;
}

// ---------- Pages ----------
function home() {
  const f = (ic, t, d) => `<div class="card"><h3>${ic} ${t}</h3><p>${d}</p></div>`;
  app.innerHTML = `
  <section class="hero">
    <h1>☀ SolarShare</h1>
    <p>A smart platform for coordinating surplus solar energy between farmers, consumers and the community — with energy monitoring, an estimated forecast and a carbon wallet.</p>
    <a class="btn amber" href="#/register">Get Started</a> <a class="btn light" href="#/login">Login</a>
  </section>
  <h2>Three roles, one platform</h2>
  <div class="grid">
    ${f('🌾', 'Farmer', 'Record solar generation and consumption, list surplus energy and respond to consumer requests.')}
    ${f('🏠', 'Consumer', 'Enter how much energy you need and request it from nearby solar producers.')}
    ${f('🏛️', 'Government', 'View aggregate community energy statistics, sharing activity and carbon savings.')}
  </div>
  <h2>Platform features</h2>
  <div class="grid">
    ${f('📊', 'Energy Monitoring', 'Generation, consumption, surplus and battery status at a glance.')}
    ${f('🤝', 'Energy Sharing', 'Simple matching, requests, accept / reject and completion tracking.')}
    ${f('🔮', 'Estimated Forecast', 'A basic 7-day estimate from your recent records.')}
    ${f('🌿', 'Carbon Wallet', 'Estimated CO₂ savings from completed energy shares.')}
    ${f('🔔', 'Analytics & Alerts', 'Charts, request alerts and an equipment-status preview.')}
  </div>`;
}

function about() {
  app.innerHTML = `
  <div class="card"><h2 style="margin-top:0">About SolarShare</h2>
  <p>SolarShare is a college prototype that helps coordinate surplus solar energy between households. Producers enter their solar generation and consumption, and the system calculates the surplus. Consumers enter their requirement and are matched with suitable producers.</p>
  <h3>How matching works</h3>
  <p>A listing is suitable if it is <b>available</b> and its <b>surplus ≥ required energy</b>. Listings in the same location are shown first.</p>
  <div class="note"><b>Important:</b> SolarShare only coordinates manually entered information and requests. It does <b>not</b> transfer electricity through the website.</div></div>`;
}

function register() {
  app.innerHTML = `
  <form class="card" onsubmit="doRegister(event)">
    <h2 style="margin-top:0">Create an account</h2>
    <label>Full name</label><input name="name" />
    <label>Email</label><input name="email" type="email" />
    <label>Password (min 6 characters)</label><input name="password" type="password" />
    <label>Phone</label><input name="phone" />
    <label>Location (city)</label><input name="location" placeholder="e.g. Ghaziabad" />
    <label>I am a</label>
    <select name="role"><option value="">-- Select role --</option><option value="producer">Farmer / Producer (has surplus solar energy)</option><option value="consumer">Consumer (needs energy)</option></select>
    <p><button class="btn">Register</button></p>
  </form>`;
}
async function doRegister(e) {
  e.preventDefault();
  try {
    saveSession(await api('/auth/register', 'POST', Object.fromEntries(new FormData(e.target))));
    location.hash = '#/dashboard';
  } catch (err) { msg(err.message); }
}

function login() {
  app.innerHTML = `
  <form class="card" onsubmit="doLogin(event)">
    <h2 style="margin-top:0">Login</h2>
    <label>Email</label><input name="email" type="email" />
    <label>Password</label><input name="password" type="password" />
    <p><button class="btn">Login</button></p>
    <div class="note">Demo accounts (password <b>demo123</b>) — click to fill:<br>
      <button type="button" class="btn small" onclick="fillLogin('producer@demo.com')">Farmer</button>
      <button type="button" class="btn small" onclick="fillLogin('consumer@demo.com')">Consumer</button>
      <button type="button" class="btn small" onclick="fillLogin('government@demo.com')">Government</button></div>
  </form>`;
}
function fillLogin(email) { const f = document.forms[0]; f.email.value = email; f.password.value = 'demo123'; }
async function doLogin(e) {
  e.preventDefault();
  try {
    saveSession(await api('/auth/login', 'POST', Object.fromEntries(new FormData(e.target))));
    location.hash = '#/dashboard';
  } catch (err) { msg(err.message); }
}

const stat = (n, l, ic) => `<div class="card stat">${ic ? `<div class="ic-big">${ic}</div>` : ''}<div class="num">${n}</div><div class="lbl">${l}</div></div>`;
const tagOf = (t) => (t === 'demo' ? '<span class="tag demo">Demo value</span>' : '<span class="tag rec">From records</span>');
const monCards = (cards) => `<div class="grid">${cards.map((c) => `<div class="card mon"><div class="mon-top"><span class="ic-big">${c.icon}</span>${tagOf(c.tag)}</div>
  <div class="num">${c.value} <small>${c.unit}</small></div><div class="lbl">${esc(c.label)}</div>
  ${c.unit === '%' ? `<div class="bar"><i style="width:${c.value}%"></i></div>` : ''}${c.tag === 'demo' ? '<div class="sub">Sample value – no battery hardware connected</div>' : ''}</div>`).join('')}</div>`;
const head = (t, sub) => `<div class="pagehead"><div><h2>${t}</h2><div class="sub">${sub}</div></div></div>`;

// Small dependency-free SVG bar chart: rows = [{label, a, b?}], names = series names
function barChart(rows, names, colors = ['#1b7f4b', '#f5a623']) {
  if (!rows.length) return '<div class="empty">No data yet — it appears once records exist.</div>';
  const W = 520, H = 190, L = 34, n = rows.length, k = names.length, gw = (W - L) / n, bw = Math.min(30, (gw - 10) / k);
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b || 0])) * 1.15;
  let s = `<svg viewBox="0 0 ${W} ${H + 22}" class="chart" role="img">`;
  for (let i = 0; i <= 4; i++) {
    const y = H - ((H - 8) * i) / 4;
    s += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="#e3ece6"/><text x="${L - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#778">${fmt((max * i) / 4)}</text>`;
  }
  rows.forEach((r, i) => {
    const x0 = L + i * gw + (gw - bw * k) / 2;
    [r.a, r.b].slice(0, k).forEach((v, j) => {
      const h = ((H - 8) * (v || 0)) / max;
      s += `<rect x="${x0 + j * bw}" y="${H - h}" width="${bw - 2}" height="${h}" rx="3" fill="${colors[j]}"><title>${esc(names[j])}: ${fmt(v)}</title></rect>`;
    });
    s += `<text x="${L + i * gw + gw / 2}" y="${H + 14}" text-anchor="middle" font-size="9.5" fill="#556">${esc(r.label)}</text>`;
  });
  return s + '</svg><div class="legend">' + names.map((nm, j) => `<span><i style="background:${colors[j]}"></i>${esc(nm)}</span>`).join('') + '</div>';
}
const chartCard = (c) => `<div class="card"><h3>📈 ${esc(c.title)}</h3>${barChart(c.rows, c.names)}</div>`;
function forecastCard(f) {
  const body = f && f.values
    ? barChart(f.values.map((v, i) => ({ label: 'Day ' + (i + 1), a: v })), ['Estimated'], ['#7cc79d']) +
      `<div class="sub">${esc(f.basis)}. A simple average/trend estimate — not a trained AI model.</div>`
    : '<div class="empty">Not enough records yet. Add data to see an estimate.</div>';
  return `<div class="card"><h3>🔮 Estimated Forecast <span class="tag est">Estimate</span></h3><div class="sub">${esc(f ? f.title : '')}</div>${body}</div>`;
}
const carbonMini = (c) => `<div class="card carbon"><h3>🌿 Carbon Wallet ${c.sample ? '<span class="tag demo">Sample data</span>' : '<span class="tag est">Estimate</span>'}</h3>
  <div class="num">${c.kg} <small>kg CO₂ saved</small></div><div class="sub">${c.kwh} kWh shared · ≈ ${c.trees} tree-years</div>
  ${c.sample ? '<div class="sub">No completed shares yet — these are illustrative sample figures.</div>' : ''}<p><a class="btn small" href="#/carbon">Open wallet</a></p></div>`;
const alertsList = (a) => a.length ? `<ul class="alerts">${a.map((x) => `<li class="${x.level}"><span>${x.level === 'warn' ? '⚠️' : 'ℹ️'}</span><div>${esc(x.text)}${x.demo ? ' <span class="tag demo">Demo</span>' : ''}</div></li>`).join('')}</ul>` : '<div class="empty">No alerts right now.</div>';
const simpleTable = (cols, rows) => `<div class="tablewrap"><table><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</table></div>`;

async function dashboard() {
  const [d, ins] = await Promise.all([api('/dashboard'), api('/insights')]);
  const charts = `<div class="two">${chartCard(ins.chart)}${forecastCard(ins.forecast)}</div>`;
  const side = `<div class="two">${carbonMini(ins.carbon)}<div class="card"><h3>🔔 Alerts</h3>${alertsList(ins.alerts.slice(0, 4))}<p><a class="btn small" href="#/analytics">All alerts &amp; equipment</a></p></div></div>`;

  if (d.role === 'government') {
    const c = ins.community;
    app.innerHTML = head('Government Overview', 'Aggregate community energy statistics from platform records') + monCards(ins.cards) +
      `<div class="grid">${stat(c.producers, 'Registered farmers', '🌾')}${stat(c.consumers, 'Registered consumers', '🏠')}${stat(c.active, 'Active listings', '📋')}${stat(c.pending, 'Pending requests', '⏳')}${stat(c.completed, 'Completed shares', '✅')}</div>` +
      charts + side + '<h2>Energy by location</h2>' +
      (c.locations.length ? simpleTable(['Location', 'Listings', 'Generated kWh', 'Consumed kWh', 'Available surplus kWh'], c.locations.map((l) => [esc(l.location), l.listings, l.generated, l.consumed, `<b>${l.available}</b>`])) : '<div class="card">No listings yet.</div>') +
      '<h2>Recent sharing activity</h2>' +
      (c.recent.length ? simpleTable(['Date', 'Listing location', 'Requested kWh', 'Status'], c.recent.map((t) => [esc(t.created_at), esc(t.location), fmt(t.requested_energy), badge(t.status)])) : '<div class="card">No sharing activity yet.</div>');
  } else if (d.role === 'producer') {
    const list = await api('/listings/mine');
    app.innerHTML = head('Farmer Dashboard', `Welcome, ${esc(user.name)} · ${esc(user.location)}`) + monCards(ins.cards) +
      `<div class="grid">${stat(d.active, 'Active listings', '📋')}${stat(d.pending, 'Pending requests', '⏳')}</div>
      <p><a class="btn" href="#/add-surplus">+ Add Surplus</a> <a class="btn amber" href="#/requests">View Requests</a></p>` +
      charts + side + `<h2>My Listings</h2>${listingsTable(list, true)}`;
  } else {
    app.innerHTML = head('Consumer Dashboard', `Welcome, ${esc(user.name)} · ${esc(user.location)}`) + monCards(ins.cards) +
      `<div class="grid">${stat(fmt(d.required) + ' kWh', 'Required energy (latest)', '🎯')}${stat(d.matches, 'Available matches', '🔎')}
      ${stat(d.pending, 'Pending requests', '⏳')}${stat(d.accepted, 'Accepted requests', '👍')}${stat(d.completed, 'Completed requests', '✅')}</div>` +
      charts + side + `<h2>Find Energy</h2>
      <form class="card wide" onsubmit="doRequirement(event)"><div class="row">
        <div><label>Required energy (kWh)</label><input name="required_energy" type="number" step="0.1" value="${d.required || ''}" /></div>
        <div><label>Location</label><input name="location" value="${esc(d.requirement_location || user.location)}" /></div>
        <div><button class="btn">Find Matches</button></div></div></form>
      <div id="matches"></div>`;
    if (d.required > 0) showMatches(d.required, d.requirement_location, null);
  }
}

async function carbon() {
  const c = (await api('/insights')).carbon;
  app.innerHTML = head('🌿 Carbon Wallet', 'Estimated CO₂ savings from completed energy-sharing records') +
    (c.sample ? '<div class="note"><span class="tag demo">Sample data</span> No completed energy shares exist yet, so the figures below are illustrative. Complete a share (consumer sends request → farmer accepts → farmer clicks Mark Completed) to see real values.</div>' : '') +
    `<div class="grid">${stat(c.kg + ' kg', 'Estimated CO₂ saved', '🌍')}${stat(c.kwh + ' kWh', 'Solar energy shared', '⚡')}${stat(c.trees, 'Tree-years equivalent', '🌳')}${stat(Math.floor(c.kg), 'Eco points (1 per kg)', '🏅')}</div>
    <div class="card"><h3>How this is estimated</h3><p>CO₂ saved ≈ shared kWh × ${c.factor} kg/kWh (an approximate grid emission factor). One tree absorbs roughly 21 kg CO₂ per year. Eco points are a demonstration score only — they are not tradable carbon credits.</p></div>
    <h2>Completed shares</h2>` +
    (c.history.length ? simpleTable(['Date', 'Location', 'Energy kWh', 'CO₂ saved kg'], c.history.map((h) => [esc(h.date), esc(h.location), fmt(h.kwh), h.kg])) : '<div class="card">No completed shares yet.</div>');
}

async function analytics() {
  const ins = await api('/insights');
  const eq = ins.equipment ? `<div class="card"><h3>🛠️ Equipment status <span class="tag demo">Demo status</span></h3><div class="sub">Sample values — no real hardware or IoT device is connected.</div>
    ${simpleTable(['Equipment', 'Status', 'Note'], ins.equipment.map((e) => [esc(e.name), `<span class="badge ${e.ok ? 'available' : 'pending'}">${esc(e.status)}</span>`, esc(e.note)]))}</div>` : '';
  app.innerHTML = head('📈 Analytics & Alerts', 'Charts, estimates and alerts based on your platform records') +
    `<div class="two">${chartCard(ins.chart)}${forecastCard(ins.forecast)}</div>
     <div class="two"><div class="card"><h3>🔔 Alerts</h3>${alertsList(ins.alerts)}</div>${eq}</div>`;
}

function listingsTable(rows, mine, reqId) {
  if (!rows.length) return '<div class="card">No listings found.</div>';
  const isConsumer = user.role === 'consumer';
  return `<div class="tablewrap"><table><tr><th>Producer</th><th>Location</th><th>Available kWh</th><th>Status</th>${mine ? '<th>Generated / Consumed</th><th>Action</th>' : (isConsumer ? '<th>Request kWh</th><th></th>' : '')}</tr>
  ${rows.map((l) => `<tr>
    <td>${esc(l.producer_name || user.name)}${l.producer_phone ? '<br><small>📞 ' + esc(l.producer_phone) + '</small>' : ''}</td>
    <td>${esc(l.location)} ${l.same_location ? '<span class="badge near">Same area</span>' : ''}</td>
    <td><b>${fmt(l.surplus_energy)}</b></td><td>${badge(l.status)}</td>
    ${mine ? `<td>${fmt(l.generated_energy)} / ${fmt(l.consumed_energy)}</td><td>${l.status === 'sold_out' ? '-' :
      `<button class="btn small ${l.status === 'available' ? 'red' : ''}" onclick="toggleListing(${l.id},'${l.status === 'available' ? 'unavailable' : 'available'}')">${l.status === 'available' ? 'Mark Unavailable' : 'Mark Available'}</button>`}</td>`
    : isConsumer ? `<td><input id="q${l.id}" type="number" step="0.1" min="0" value="${window._want || ''}" style="width:100px" /></td>
      <td><button class="btn small" onclick="sendRequest(${l.id},${reqId || 'null'})">Send Request</button></td>` : ''}
  </tr>`).join('')}</table></div>`;
}

async function doRequirement(e) {
  e.preventDefault();
  try {
    const f = Object.fromEntries(new FormData(e.target));
    const r = await api('/requirements', 'POST', f);
    msg(r.matches.length ? `Found ${r.matches.length} suitable listing(s).` : 'No suitable listings found for this requirement.', r.matches.length ? 'success' : 'error');
    renderMatches(r.matches, f.required_energy, r.id);
  } catch (err) { msg(err.message); }
}
async function showMatches(required, loc, reqId) {
  renderMatches(await api(`/matches?required=${required}&location=${encodeURIComponent(loc)}`), required, reqId);
}
function renderMatches(rows, required, reqId) {
  window._want = required;
  document.getElementById('matches').innerHTML = `<h2>Suitable Matches (surplus ≥ ${fmt(required)} kWh)</h2>` + listingsTable(rows, false, reqId);
}

async function toggleListing(id, status) {
  try { await api(`/listings/${id}/status`, 'PUT', { status }); dashboard(); } catch (err) { msg(err.message); }
}

async function sendRequest(listingId, reqId) {
  try {
    await api('/requests', 'POST', { listing_id: listingId, requested_energy: document.getElementById('q' + listingId).value, requirement_id: reqId });
    msg('Request sent to the producer!', 'success');
    location.hash = '#/requests';
  } catch (err) { msg(err.message); }
}

function addSurplus() {
  app.innerHTML = `
  <form class="card" onsubmit="doAddSurplus(event)">
    <h2 style="margin-top:0">Add Surplus Energy</h2>
    <label>Solar energy generated (kWh)</label><input name="generated_energy" type="number" step="0.1" oninput="calcSurplus()" />
    <label>Your own consumption (kWh)</label><input name="consumed_energy" type="number" step="0.1" oninput="calcSurplus()" />
    <div class="note">Calculated surplus: <b id="surplus">0</b> kWh</div>
    <label>Location</label><input name="location" value="${esc(user.location)}" />
    <label>Availability</label><select name="status"><option value="available">Available</option><option value="unavailable">Unavailable</option></select>
    <p><button class="btn">Create Listing</button></p>
  </form>`;
}
function calcSurplus() {
  const f = document.forms[0];
  document.getElementById('surplus').textContent = fmt((Number(f.generated_energy.value) || 0) - (Number(f.consumed_energy.value) || 0));
}
async function doAddSurplus(e) {
  e.preventDefault();
  try {
    await api('/listings', 'POST', Object.fromEntries(new FormData(e.target)));
    msg('Surplus listing created!', 'success');
    location.hash = '#/dashboard';
  } catch (err) { msg(err.message); }
}

async function listings() {
  app.innerHTML = `<h2 style="margin-top:0">Available Surplus Listings</h2>
  <form class="card wide" onsubmit="filterListings(event)"><div class="row">
    <div><label>Minimum kWh</label><input name="min" type="number" step="0.1" /></div>
    <div><label>Location</label><input name="location" placeholder="e.g. Noida" /></div>
    <div><button class="btn">Search</button></div></div></form><br><div id="list"></div>`;
  loadListings('');
}
function filterListings(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  loadListings(`?min=${encodeURIComponent(f.min)}&location=${encodeURIComponent(f.location)}`);
}
async function loadListings(q) {
  try { window._want = ''; document.getElementById('list').innerHTML = listingsTable(await api('/listings' + q), false, null); }
  catch (err) { msg(err.message); }
}

async function requests() {
  if (user.role === 'producer') {
    const rows = await api('/requests/incoming');
    app.innerHTML = `<h2 style="margin-top:0">Consumer Requests</h2>` + (!rows.length ? '<div class="card">No requests yet.</div>' :
      `<div class="tablewrap"><table><tr><th>Consumer</th><th>Listing location</th><th>Requested kWh</th><th>Status</th><th>Date</th><th>Action</th></tr>
      ${rows.map((t) => `<tr><td>${esc(t.consumer_name)}<br><small>📞 ${esc(t.consumer_phone)}</small></td><td>${esc(t.listing_location)}</td>
      <td>${fmt(t.requested_energy)}</td><td>${badge(t.status)}</td><td>${esc(t.created_at)}</td><td>
      ${t.status === 'pending' ? `<button class="btn small" onclick="act(${t.id},'accept')">Accept</button> <button class="btn small red" onclick="act(${t.id},'reject')">Reject</button>` : ''}
      ${t.status === 'accepted' ? `<button class="btn small amber" onclick="act(${t.id},'complete')">Mark Completed</button>` : ''}</td></tr>`).join('')}</table></div>`);
  } else {
    const rows = await api('/requests/mine');
    app.innerHTML = `<h2 style="margin-top:0">My Requests</h2>` + (!rows.length ? '<div class="card">You have not sent any requests yet. Go to Available Surplus to send one.</div>' :
      `<div class="tablewrap"><table><tr><th>Producer</th><th>Location</th><th>Requested kWh</th><th>Status</th><th>Date</th></tr>
      ${rows.map((t) => `<tr><td>${esc(t.producer_name)}${t.status === 'accepted' || t.status === 'completed' ? '<br><small>📞 ' + esc(t.producer_phone) + '</small>' : ''}</td>
      <td>${esc(t.listing_location)}</td><td>${fmt(t.requested_energy)}</td><td>${badge(t.status)}</td><td>${esc(t.created_at)}</td></tr>`).join('')}</table></div>`);
  }
}
async function act(id, action) {
  try { await api('/requests/' + id, 'PUT', { action }); msg('Request updated.', 'success'); requests(); }
  catch (err) { msg(err.message); }
}

async function profile() {
  const me = await api('/me');
  app.innerHTML = `
  <form class="card" onsubmit="doProfile(event)">
    <h2 style="margin-top:0">My Profile</h2>
    <label>Email (cannot be changed)</label><input value="${esc(me.email)}" disabled />
    <label>Role</label><input value="${esc(me.role)}" disabled />
    <label>Name</label><input name="name" value="${esc(me.name)}" />
    <label>Phone</label><input name="phone" value="${esc(me.phone)}" />
    <label>Location</label><input name="location" value="${esc(me.location)}" />
    <p><button class="btn">Save Changes</button></p>
  </form>`;
}
async function doProfile(e) {
  e.preventDefault();
  try {
    user = await api('/me', 'PUT', Object.fromEntries(new FormData(e.target)));
    localStorage.setItem('user', JSON.stringify(user));
    renderNav();
    msg('Profile updated.', 'success');
  } catch (err) { msg(err.message); }
}

// ---------- Router ----------
const routes = { home, about, register, login, dashboard, 'add-surplus': addSurplus, listings, requests, profile, carbon, analytics };
const protectedPages = ['dashboard', 'add-surplus', 'listings', 'requests', 'profile', 'carbon', 'analytics'];

async function router() {
  const name = location.hash.replace('#/', '') || 'home';
  renderNav();
  if (protectedPages.includes(name) && !user) { location.hash = '#/login'; return; }
  if (user && user.role === 'government' && ['add-surplus', 'requests'].includes(name)) { location.hash = '#/dashboard'; return; }
  if (name === 'add-surplus' && user.role !== 'producer') { msg('Only producers can add surplus.'); location.hash = '#/dashboard'; return; }
  try { await (routes[name] || home)(); } catch (err) { msg(err.message); }
}
window.addEventListener('hashchange', router);
router();