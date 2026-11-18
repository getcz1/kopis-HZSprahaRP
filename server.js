'use strict';
/* Jednoduchý server bez závislostí (Node.js 18+):
   - servíruje aplikaci,
   - čte nastavení ze souboru .env (Discord, role, webhooky, pingy),
   - ověřuje přihlášení přes Discord a odesílá webhooky (adresy webhooků zůstávají jen na serveru).
   Spuštění:  node server.js   */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

/* ---------- .env ---------- */
function parseEnv(txt) {
  const out = {};
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('='); if (i < 1) continue;
    const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, ''); // komentář na konci řádku
    out[k] = v;
  }
  return out;
}
const ROOT = __dirname;
// cad.env se hledá nejdřív MIMO veřejnou složku (o 1–3 úrovně výš); uvnitř složky jen jako nouzová možnost
const UP = n => path.resolve(ROOT, ...Array(n).fill('..'));
const DIRS = [ROOT, ...[1, 2, 3].map(UP)]; // nejdřív složka aplikace, pak nad ní
const CANDIDATES = [process.env.ENV_FILE, ...DIRS.flatMap(d => [path.join(d, 'cad.env.php'), path.join(d, 'cad.env')]), path.join(ROOT, '.env')].filter(Boolean);
const FILE = CANDIDATES.find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } });
let fileEnv = {}, warns = [];
if (FILE) fileEnv = parseEnv(fs.readFileSync(FILE, 'utf8')); else warns.push('Soubor cad.env nenalezen – nahrajte ho o úroveň výš, mimo veřejnou složku (viz README).');
const E = k => String(process.env[k] !== undefined ? process.env[k] : (fileEnv[k] || '')).trim();

const KINDS = ['zu', 'jsdh', 'tm', 'zpp'];
const isUrl = v => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } };
const isId = v => /^\d{17,20}$/.test(v);
const cfg = {
  port: parseInt(E('PORT'), 10) || 3000,
  clientId: E('DISCORD_CLIENT_ID'), guildId: E('DISCORD_GUILD_ID'),
  roles: { admin: E('DISCORD_ROLE_ADMIN'), dispatch: E('DISCORD_ROLE_DISPATCH'), fire: E('DISCORD_ROLE_FIRE'), commander: E('DISCORD_ROLE_COMMANDER') },
  demo: /^(1|true|yes|on)$/i.test(E('ALLOW_DEMO')), redirect: E('REDIRECT_URL'),
  api: (E('DISCORD_API') || 'https://discord.com/api').replace(/\/+$/, '')
};
for (const [n, v] of [['DISCORD_CLIENT_ID', cfg.clientId], ['DISCORD_GUILD_ID', cfg.guildId], ...Object.entries(cfg.roles).map(([k, v]) => ['DISCORD_ROLE_' + k.toUpperCase(), v])])
  if (v && !isId(v)) warns.push(`${n} by mělo být číslo (17–20 číslic)`);
if (cfg.redirect && !isUrl(cfg.redirect)) { warns.push('REDIRECT_URL není platná adresa – ignoruji'); cfg.redirect = ''; }
const hooks = {}, pings = {};
for (const k of KINDS) {
  const K = k.toUpperCase(); // TM i ZPP do jednoho kanálu, ping role ale každý svůj
  const h = E('WEBHOOK_' + K) || ((k === 'tm' || k === 'zpp') ? E('WEBHOOK_DENNI') : '') || E('WEBHOOK_DEFAULT'), p = E('PING_' + K);
  if (h) { if (isUrl(h)) hooks[k] = h; else warns.push(`WEBHOOK_${K} není platná adresa – ignoruji`); }
  if (p) { if (isId(p)) pings[k] = p; else warns.push(`PING_${K} musí být ID role (17–20 číslic) – ignoruji`); }
}
let SECRET = E('SESSION_SECRET'); const SECRET_OK = SECRET.length >= 16;
if (SECRET.length < 16) { SECRET = crypto.randomBytes(32).toString('hex'); warns.push('SESSION_SECRET není nastaven (min. 16 znaků) – přihlášení přestane platit po restartu serveru'); }

/* ---------- relace (podepsaný token) ---------- */
const SESSION_MS = 30 * 864e5;
const mac = body => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
const sign = payload => { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return body + '.' + mac(body); };
function verify(tok) {
  if (typeof tok !== 'string') return null;
  const [body, sig] = tok.split('.'); if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

/* ---------- pomocné funkce ---------- */
const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
};
const readBody = (req, max = 100000) => new Promise((resolve, reject) => {
  let n = 0, big = false; const ch = [];
  req.on('data', c => { n += c.length; if (n > max) big = true; else ch.push(c); });
  req.on('end', () => {
    if (big) return reject(Object.assign(new Error('too_large'), { code: 413 }));
    try { resolve(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch { reject(Object.assign(new Error('bad_json'), { code: 400 })); }
  });
  req.on('error', reject);
});
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

/* ---------- API ---------- */
const publicConfig = () => ({ // bez tajných hodnot: jen ID aplikace/serveru a informace, co je nastaveno
  clientId: cfg.clientId, guildId: cfg.guildId, redirect: cfg.redirect, demo: cfg.demo,
  roles: Object.fromEntries(Object.entries(cfg.roles).map(([k, v]) => [k, !!v])),
  backup: Object.fromEntries(KINDS.map(k => [k, !!hooks[k]])), ping: Object.fromEntries(KINDS.map(k => [k, !!pings[k]])),
  secret: SECRET_OK, envFound: !!FILE, envInside: false
});

const COOKIE = 'cad_sess';
const cookieOf = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => { const i = c.indexOf('='); return i < 0 ? ['', ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())]; }));
const setCookie = (res, tok, long) => res.setHeader('Set-Cookie', `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax${long && tok ? '; Max-Age=' + 30 * 86400 : tok ? '' : '; Max-Age=0'}`);
const curSession = req => (SECRET_OK ? verify(cookieOf(req)[COOKIE] || '') : null);

/* ---------- sdílený stav (společný pro všechny uživatele) ---------- */
const STATE_DIR = path.join(ROOT, 'cad-data'), SOUND_DIR = path.join(ROOT, 'media', 'sounds'), GUARD = '<?php exit; ?>\n';
const stateFile = () => path.join(STATE_DIR, 'state.php');
function stateRead() {
  try { const raw = fs.readFileSync(stateFile(), 'utf8'), nl = raw.indexOf('\n'); const j = JSON.parse(nl < 0 ? raw : raw.slice(nl + 1)); return j && typeof j === 'object' ? j : null; } catch { return null; }
}
const HTA = '<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n';
const ensureDir = d => {
  try {
    fs.mkdirSync(d, { recursive: true });
    if (d === STATE_DIR && !fs.existsSync(path.join(d, '.htaccess'))) fs.writeFileSync(path.join(d, '.htaccess'), HTA); // ochranu si složka vytvoří sama
    return true;
  } catch { return false; }
};
const allowedKeys = perms => perms.includes('admin') ? ['settings', 'types', 'sections', 'vehicles', 'people', 'calls', 'seq']
  : perms.includes('dispatch') ? ['vehicles', 'people', 'calls', 'seq']
  : perms.includes('commander') ? ['vehicles', 'calls', 'seq'] : [];
function mergeCalls(stored, incoming) { // sloučení podle čísla události, ať se neztratí výjezd od jiného dispečera
  const out = [], seen = new Set();
  for (const c of Array.isArray(incoming) ? incoming : []) if (c && c.no !== undefined) { out.push(c); seen.add(String(c.no)); }
  for (const c of Array.isArray(stored) ? stored : []) if (c && c.no !== undefined && !seen.has(String(c.no))) out.push(c);
  out.sort((a, b) => (a.t || 0) - (b.t || 0));
  return out.length > 500 ? out.slice(-500) : out;
}
const presFile = () => path.join(STATE_DIR, 'presence.php');
function presRead() {
  try {
    const raw = fs.readFileSync(presFile(), 'utf8'), nl = raw.indexOf('\n');
    const j = JSON.parse(nl < 0 ? raw : raw.slice(nl + 1)), now = Date.now(), o = {};
    for (const [k, v] of Object.entries(j || {})) if (typeof v === 'number' && now - v < 300000) o[k] = v;
    return o;
  } catch { return {}; }
}
function ping(req, res) { // jen značka "jsem online" – nemění celý stav
  const sess = curSession(req); if (!sess) return send(res, 401, { error: 'unauthorized' });
  if (!ensureDir(STATE_DIR)) return send(res, 200, { ok: false });
  const j = presRead(); j[String(sess.id)] = Date.now();
  try { fs.writeFileSync(presFile(), GUARD + JSON.stringify(j)); } catch { return send(res, 200, { ok: false }); }
  send(res, 200, { ok: true });
}
const preFile = () => path.join(STATE_DIR, 'prealert.php');
function preRead() { // předhlášení platí jen krátce
  try {
    const raw = fs.readFileSync(preFile(), 'utf8'), nl = raw.indexOf('\n');
    const j = JSON.parse(nl < 0 ? raw : raw.slice(nl + 1));
    return j && j.t && Date.now() - j.t < 120000 ? j : null;
  } catch { return null; }
}
async function prealert(req, res) { // dispečer vybral jednotky a typ -> jim zahraje pre-gong ještě před vyhlášením
  const sess = curSession(req); if (!sess) return send(res, 401, { error: 'unauthorized' });
  if (!sess.perms.includes('dispatch') && !sess.perms.includes('admin')) return send(res, 403, { error: 'forbidden' });
  const b = await readBody(req);
  const units = (Array.isArray(b.units) ? b.units : []).slice(0, 50).filter(u => typeof u === 'number').map(u => u | 0);
  const type = typeof b.type === 'number' ? b.type | 0 : 0;
  if (!units.length || !type) return send(res, 400, { error: 'bad_request' });
  if (!ensureDir(STATE_DIR)) return send(res, 200, { ok: false });
  try { fs.writeFileSync(preFile(), GUARD + JSON.stringify({ t: Date.now(), type, units })); } catch { return send(res, 200, { ok: false }); }
  send(res, 200, { ok: true });
}
async function state(req, res) {
  if (!SECRET_OK) return send(res, 503, { error: 'no_secret' });
  const sess = curSession(req); if (!sess) return send(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET') {
    const st = stateRead(), rev = st ? (st.rev | 0) : 0;
    const have = new URL(req.url, 'http://localhost').searchParams.get('rev');
    const presence = presRead(), pre = preRead();
    if (st && have !== null && +have === rev) return send(res, 200, { rev, same: true, presence, prealert: pre });
    return send(res, 200, { rev, state: st, presence, prealert: pre });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  const b = await readBody(req, 12000000);
  if (!b.patch || typeof b.patch !== 'object') return send(res, 400, { error: 'bad_request' });
  const allow = allowedKeys(sess.perms);
  for (const k of Object.keys(b.patch)) if (!allow.includes(k)) return send(res, 403, { error: 'forbidden_key', key: k });
  if (!ensureDir(STATE_DIR)) return send(res, 500, { error: 'not_writable', dir: 'cad-data' });
  const cur = stateRead() || { rev: 0 };
  for (const [k, v] of Object.entries(b.patch)) {
    if (k === 'calls') cur.calls = mergeCalls(cur.calls, v);
    else if (k === 'seq') cur.seq = Math.max(v | 0, cur.seq | 0);
    else cur[k] = v;
  }
  cur.rev = (cur.rev | 0) + 1; cur.at = Date.now();
  try { fs.writeFileSync(stateFile(), GUARD + JSON.stringify(cur)); } catch { return send(res, 500, { error: 'not_writable', dir: 'cad-data' }); }
  send(res, 200, { rev: cur.rev, state: cur });
}
function registerPerson(user) { // propojení Discord účtu se seznamem osob provádí server
  if (!user.perms.some(x => x === 'fire' || x === 'commander')) return;
  if (!ensureDir(STATE_DIR)) return;
  const cur = stateRead() || { rev: 0 };
  if (!Array.isArray(cur.people)) cur.people = [];
  if (cur.people.some(p => String(p.did) === String(user.id))) return;
  cur.people.push({ id: Date.now(), name: user.name, call: '', did: String(user.id), rank: '', vid: 0 });
  cur.rev = (cur.rev | 0) + 1; cur.at = Date.now();
  try { fs.writeFileSync(stateFile(), GUARD + JSON.stringify(cur)); } catch { }
}
async function sound(req, res) { // nahrání gongu: uloží se na server, slyší ho všichni
  if (!SECRET_OK) return send(res, 503, { error: 'no_secret' });
  const sess = curSession(req); if (!sess) return send(res, 401, { error: 'unauthorized' });
  if (!sess.perms.includes('admin')) return send(res, 403, { error: 'forbidden' });
  const b = await readBody(req, 12000000);
  const ext = (String(b.name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1];
  if (!['mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac', 'webm', 'mp4'].includes(ext)) return send(res, 400, { error: 'bad_type' });
  let bin; try { bin = Buffer.from(String(b.data || '').replace(/^data:[^,]*,/, ''), 'base64'); } catch { return send(res, 400, { error: 'bad_data' }); }
  if (bin.length < 16) return send(res, 400, { error: 'bad_data' });
  if (bin.length > 8000000) return send(res, 413, { error: 'too_large' });
  if (!ensureDir(SOUND_DIR)) return send(res, 500, { error: 'not_writable', dir: 'media/sounds' });
  const slot = (String(b.slot || 'zvuk').replace(/[^a-z0-9]+/gi, '-').slice(0, 24).replace(/^-|-$/g, '') || 'zvuk');
  const file = `${slot}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  try { fs.writeFileSync(path.join(SOUND_DIR, file), bin); } catch { return send(res, 500, { error: 'not_writable', dir: 'media/sounds' }); }
  const old = String(b.old || '');
  if (/^media\/sounds\/[A-Za-z0-9._-]+$/.test(old) && !old.includes('..')) { try { fs.unlinkSync(path.join(ROOT, old)); } catch { } }
  send(res, 200, { url: 'media/sounds/' + file });
}

async function session(req, res) {
  const b = await readBody(req); let user;
  if (b.demo) {
    if (!cfg.demo) return send(res, 403, { error: 'demo_disabled' });
    const name = str(b.name, 40).trim() || 'Demo', role = ['fire', 'commander', 'dispatch', 'admin'].includes(b.role) ? b.role : 'fire';
    user = { id: 'demo:' + name.toLowerCase(), name, perms: [role] };
  } else {
    if (!cfg.guildId || !Object.values(cfg.roles).some(Boolean)) return send(res, 503, { error: 'not_configured' });
    if (typeof b.token !== 'string' || b.token.length < 10 || b.token.length > 300) return send(res, 400, { error: 'bad_request' });
    let r;
    try { r = await fetch(`${cfg.api}/users/@me/guilds/${encodeURIComponent(cfg.guildId)}/member`, { headers: { Authorization: 'Bearer ' + b.token } }); }
    catch { return send(res, 502, { error: 'discord_unreachable' }); }
    if (r.status === 404) return send(res, 404, { error: 'not_member' });
    if (!r.ok) return send(res, 401, { error: 'discord_rejected', status: r.status });
    let m; try { m = await r.json(); } catch { return send(res, 502, { error: 'discord_bad_response' }); }
    if (!m || !m.user) return send(res, 502, { error: 'discord_bad_response' });
    const roles = Array.isArray(m.roles) ? m.roles : [];
    const perms = Object.keys(cfg.roles).filter(k => cfg.roles[k] && roles.includes(cfg.roles[k]));
    if (!perms.length) return send(res, 403, { error: 'no_role', roleCount: roles.length });
    user = { id: String(m.user.id), name: str(m.nick || m.user.global_name || m.user.username || 'Uživatel', 60), perms };
  }
  registerPerson(user);
  setCookie(res, sign({ ...user, exp: Date.now() + SESSION_MS }), !!b.remember);
  send(res, 200, { user });
}

function cleanEmbed(e) { // do Discordu jde jen ověřená podoba embedu
  if (!e || typeof e !== 'object' || !str(e.title, 256)) return null;
  const out = { title: str(e.title, 256) };
  if (Number.isInteger(e.color) && e.color >= 0 && e.color <= 0xFFFFFF) out.color = e.color;
  if (e.timestamp && !isNaN(Date.parse(e.timestamp))) out.timestamp = new Date(e.timestamp).toISOString();
  if (e.footer && e.footer.text) out.footer = { text: str(e.footer.text, 2048) };
  out.fields = (Array.isArray(e.fields) ? e.fields : []).slice(0, 10).map(f => ({ name: str(f && f.name, 256) || '—', value: str(f && f.value, 1024) || '—', inline: !!(f && f.inline) }));
  return out;
}
const hits = new Map();
const limited = id => { const now = Date.now(), a = (hits.get(id) || []).filter(t => now - t < 60000); a.push(now); hits.set(id, a); return a.length > 12; };

async function backup(req, res) {
  const b = await readBody(req), s = curSession(req);
  if (!s) return send(res, 401, { error: 'unauthorized' });
  if (!s.perms.includes('dispatch') && !s.perms.includes('admin')) return send(res, 403, { error: 'forbidden' });
  if (limited(s.id)) return send(res, 429, { error: 'rate_limited' });
  const k = b.kind;
  if (!KINDS.includes(k)) return send(res, 400, { error: 'bad_kind' });
  if (!hooks[k]) return send(res, 400, { error: 'no_webhook' });
  const embed = cleanEmbed(b.embed); if (!embed) return send(res, 400, { error: 'bad_embed' });
  const pid = pings[k], payload = { username: 'CAD', allowed_mentions: pid ? { roles: [pid] } : { parse: [] }, embeds: [embed] };
  if (pid) payload.content = `<@&${pid}> ${str(b.text, 300)}`.trim(); // ping role z .env (embed sám nepinguje)
  let r;
  try { r = await fetch(hooks[k], { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch { return send(res, 502, { error: 'webhook_unreachable' }); }
  if (!r.ok) return send(res, 502, { error: 'webhook_failed', status: r.status });
  send(res, 200, { ok: true });
}

/* ---------- statické soubory (jen povolené) ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const PAGES = new Set(['index.html', 'callback.html', 'style.css', 'app.js']);
const MEDIA = path.join(ROOT, 'media') + path.sep;
const notFound = res => send(res, 404, { error: 'not_found' });
function serveStatic(req, res, p) {
  let rel; try { rel = decodeURIComponent(p).replace(/^\/+/, ''); } catch { return send(res, 400, { error: 'bad_path' }); }
  if (rel === '') rel = 'index.html';
  if (rel.includes('\0')) return send(res, 400, { error: 'bad_path' });
  let file;
  if (PAGES.has(rel)) file = path.join(ROOT, rel);
  else if (rel.startsWith('media/')) { file = path.resolve(ROOT, rel); if (!file.startsWith(MEDIA)) return notFound(res); }
  else return notFound(res);
  const ext = path.extname(file).toLowerCase(); if (!MIME[ext]) return notFound(res);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const size = st.size, hdr = { 'Content-Type': MIME[ext], 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP, 'Cache-Control': rel.startsWith('media/') ? 'public, max-age=3600' : 'no-cache' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) { // částečný obsah (nutné pro přehrávání a posouvání videa)
      let a = m[1] === '' ? size - parseInt(m[2], 10) : parseInt(m[1], 10), z = m[1] !== '' && m[2] !== '' ? parseInt(m[2], 10) : size - 1;
      a = Math.max(a, 0); z = Math.min(z, size - 1);
      if (isNaN(a) || isNaN(z) || a > z) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...hdr, 'Content-Range': `bytes ${a}-${z}/${size}`, 'Content-Length': z - a + 1 });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start: a, end: z }).pipe(res);
    }
    res.writeHead(200, { ...hdr, 'Content-Length': size });
    req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost'), p = u.pathname;
    const route = p === '/api.php' ? (u.searchParams.get('r') || '') : p.startsWith('/api/') ? p.slice(5) : null; // stejné rozhraní jako api.php
    if (route !== null) {
      if (route === 'config' && req.method === 'GET') return send(res, 200, publicConfig());
      if (route === 'session' && req.method === 'POST') return await session(req, res);
      if (route === 'backup' && req.method === 'POST') return await backup(req, res);
      if (route === 'me' && req.method === 'GET') { const u = curSession(req); return send(res, 200, { user: u ? { id: u.id, name: u.name, perms: u.perms } : null }); }
      if (route === 'logout' && req.method === 'POST') { setCookie(res, '', false); return send(res, 200, { ok: true }); }
      if (route === 'state') return await state(req, res);
      if (route === 'ping' && req.method === 'POST') return ping(req, res);
      if (route === 'prealert' && req.method === 'POST') return await prealert(req, res);
      if (route === 'sound' && req.method === 'POST') return await sound(req, res);
      return notFound(res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
    serveStatic(req, res, p);
  } catch (e) { if (!res.headersSent) send(res, e.code === 413 || e.code === 400 ? e.code : 500, { error: e.message === 'too_large' || e.message === 'bad_json' ? e.message : 'server_error' }); }
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${cfg.port} je obsazený. Změňte PORT v .env.` : e.message); process.exit(1); });
server.listen(cfg.port, () => {
  const ok = b => (b ? '✔' : '✖');
  console.log(`CAD běží na http://localhost:${cfg.port}`);
  console.log(`Discord: client ${ok(cfg.clientId)}  server ${ok(cfg.guildId)}  role ${Object.entries(cfg.roles).map(([k, v]) => k + ok(v)).join(' ')}`);
  console.log(`Webhooky: ${KINDS.map(k => k + ok(hooks[k])).join(' ')}   Pingy: ${KINDS.map(k => k + ok(pings[k])).join(' ')}   Demo režim: ${cfg.demo ? 'zapnut' : 'vypnut'}`);
  warns.forEach(w => console.warn('! ' + w));
});
