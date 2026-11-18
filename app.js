'use strict';
/* ===== Pomocné funkce ===== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ST = ['Ve stanici', 'Výjezd', 'Na místě', 'Návrat', 'Mimo službu'];
const ORIGINS = ['Volající', 'Linka 150', 'Linka 112', 'Rádio', 'Dispečer', 'Jiné'];
const CALLIN = { zu: 'Záchranný Útvar', jsdh: 'JSDH', tm: 'TM', zpp: 'ZPP' };
const API = 'api.php?r=';
const APPV = '36';

const DEFAULT_TERMS = [
  'Tento systém slouží pouze pro hru a hraní rolí (roleplay). Nejde o skutečný záchranný systém. Ve skutečné nouzi volejte 112 nebo 150.',
  'Přístup mají pouze členové Discord serveru s přidělenou rolí. Oprávnění se řídí rolemi na Discordu.',
  'Je zakázáno sdílet své přihlášení, zneužívat systém nebo vyhlašovat poplachy mimo pravidla hry.',
  'Ukládáme jen Discord ID, zobrazované jméno a role potřebné pro provoz systému.',
  'Provozovatel může přístup kdykoli omezit nebo zrušit. Systém je poskytován bez záruky.'
].join('\n');

const DEF_PRON = [
  { id: 1, from: 'ZÚ', to: 'Záchranný útvar' }, { id: 2, from: 'TM', to: 'Tiskový mluvčí' },
  { id: 3, from: 'JSDH', to: 'Jednotka sboru dobrovolných hasičů' }, { id: 4, from: 'HZS', to: 'Hasičský záchranný sbor' },
  { id: 5, from: 'CAS', to: 'cisternová automobilová stříkačka' }, { id: 6, from: 'DA', to: 'dopravní automobil' },
  { id: 7, from: 'AZ', to: 'automobilový žebřík' }, { id: 8, from: 'PHA', to: 'Praha' }
];

const DEF = {
  settings: {
    name: 'CAD – Hasičský záchranný sbor', vol: 0.8, rate: 1, tts: true, gong: null,
    video: 'media/subway-surfers.mp4', voice: '', terms: DEFAULT_TERMS
  },
  types: [
    { id: 1, name: 'Požár', pre: null, subs: ['Nízké budovy', 'Vysoké budovy', 'Vegetace a les', 'Vozidlo', 'Průmysl'] }, { id: 2, name: 'Dopravní nehoda', pre: null, subs: ['Osobní vozidla', 'Nákladní vozidlo', 'Hromadná nehoda', 'Železnice'] },
    { id: 3, name: 'Technická pomoc', pre: null, subs: ['Otevření bytu', 'Odstranění stromu', 'Záchrana zvířete', 'Čerpání vody'] }, { id: 4, name: 'Únik nebezpečné látky', pre: null, subs: ['Plyn', 'Ropné látky', 'Chemikálie'] }
  ],
  people: [],
  vehicles: [
    { id: 1, name: 'CAS 20 Praha 1', call: 'PHA-1', type: 'CAS', sub: 'První výjezd', station: 'CHS Holešovice', sec: 2, st: 0 },
    { id: 2, name: 'DA 12 Praha 1', call: 'PHA-2', type: 'DA', sub: 'Druhý výjezd', station: 'CHS Holešovice', sec: 2, st: 0 },
    { id: 3, name: 'CAS 24 Radotín', call: 'RAD-1', type: 'CAS', sub: 'První výjezd', station: 'HS 8 Radotín', sec: 3, st: 0 },
    { id: 4, name: 'CAS 30 ZÚ', call: 'ZU-1', type: 'CAS', sub: 'Záchranný útvar', station: 'ZÚ', sec: 1, pov: 'zu', st: 0 },
    { id: 5, name: 'AZ 40 ZÚ', call: 'ZU-2', type: 'AZ', sub: 'Záchranný útvar', station: 'ZÚ', sec: 1, pov: 'zu', st: 0 },
    { id: 6, name: 'CAS 20 Satalice', call: 'SAT-1', type: 'CAS', sub: 'JSDH', station: 'JSDH Satalice', sec: 4, pov: 'jsdh', st: 0 },
    { id: 7, name: 'TM 1', call: 'TM-1', type: 'TM', sub: 'Denní zaměstnanci', station: 'TM', sec: 5, pov: 'tm', st: 0 },
    { id: 8, name: 'ZPP 1', call: 'ZPP-1', type: 'ZPP', sub: 'Denní zaměstnanci', station: 'ZPP', sec: 6, pov: 'zpp', st: 0 }
  ],
  sections: [{ id: 1, name: 'ZÚ', kind: 'zu' }, { id: 2, name: 'CHS-Holešovice', kind: 'hzs' }, { id: 3, name: 'HS 8-Radotín', kind: 'hzs' }, { id: 4, name: 'JSDH Praha Satalice', kind: 'jsdh' }, { id: 5, name: 'TM', kind: 'tm' }, { id: 6, name: 'ZPP', kind: 'zpp' }],
  calls: [], seq: 1
};

const SHARED = ['settings', 'types', 'sections', 'vehicles', 'people', 'calls', 'seq']; // vše sdílené, uloženo na serveru
function fromServer(st) { // doplní chybějící klíče výchozími hodnotami
  const d = structuredClone(DEF), r = { ...d, ...(st || {}), settings: { ...d.settings, ...((st || {}).settings || {}) } };
  r.types.forEach(t => { if (!Array.isArray(t.subs)) t.subs = ((DEF.types.find(x => x.id === t.id) || {}).subs || []).slice(); });
  r.vehicles.forEach(v => { if (v.sec === undefined) v.sec = 0; });
  r.pron = Array.isArray(r.settings.pron) ? r.settings.pron : structuredClone(DEF_PRON); // výslovnost je součástí nastavení
  return r;
}

let S = fromServer(null), U = null, tab = '', at = 'server', ed = {}, dirty = 0, mycall = null, ctab = 'notes';
let rev = -1, mirror = null, syncing = false, seenAlarms = null, netErr = '', lastSave = 'zatím nic';
let seenPre = null, preKey = '', preTimer = 0;
const secOpen = {}; // co si uživatel rozbalil, zůstane rozbalené // předhlášení (pre-gong) ještě před vyhlášením výjezdu
const getVeh = () => { const p = U && S.people.find(p => p.did && p.did === U.id); return p ? +p.vid || 0 : 0; }; // vozidlo přiřazené dispečerem
let presence = {};
const online = p => !!p.did && Date.now() - (presence[p.did] || 0) < 90000;
let memConsent = false; // souhlas se nikam neukládá, platí pro toto otevření stránky
const consentOk = () => memConsent;
const remOn = () => $('#rem').checked;
const view = $('#view');
const can = r => !!U && (U.perms.includes('admin') || U.perms.includes(r));
const canTab = k => (k === 'history' ? can('dispatch') || can('commander') : can(k));
const vname = id => (S.vehicles.find(v => v.id === id) || {}).name || '?';

window.addEventListener('error', e => { netErr = 'Chyba v aplikaci: ' + (e.message || e.error) + ' (' + String(e.filename || '').split('/').pop() + ':' + e.lineno + ')'; try { netBar(); } catch { } });
window.addEventListener('unhandledrejection', e => { netErr = 'Chyba v aplikaci: ' + ((e.reason && e.reason.message) || e.reason); try { netBar(); } catch { } });
let staleIdx = false;
function netBar() { // chyba ukládání se musí ukázat i když má uživatel kurzor ve formuláři
  let el = $('#neterr');
  if (!el) { // starý index.html z cache prohlížeče – prvek si doplníme sami
    staleIdx = true;
    el = document.createElement('div'); el.id = 'neterr'; el.className = 'warn'; el.setAttribute('role', 'alert');
    el.style.cssText = 'margin:1rem;padding:.8rem 1rem;border:1px solid #d6202f;background:#2a1013;border-radius:8px';
    const m = document.querySelector('main') || document.body; m.parentNode.insertBefore(el, m);
  }
  if (staleIdx && !netErr) netErr = 'Prohlížeč používá starou verzi stránky. Stiskněte Ctrl+F5 (nebo otevřete stránku v anonymním okně).';
  el.hidden = !netErr;
  el.innerHTML = netErr ? `<b>Chyba</b> ${esc(netErr)} <button type="button" id="againbtn">Zkusit znovu</button>` : '';
  const b = $('#againbtn'); if (b) b.onclick = () => { netErr = ''; netBar(); save(); sync(); };
}
function save(soft) { // uloží se na server, takže změnu uvidí všichni
  if (!Array.isArray(S.pron)) S.pron = structuredClone(DEF_PRON);
  S.settings.pron = S.pron;
  const patch = {};
  for (const k of SHARED) if (JSON.stringify(S[k]) !== JSON.stringify((mirror || {})[k])) patch[k] = S[k];
  render(soft);
  if (Object.keys(patch).length) push(patch);
  else { lastSave = 'nebylo co uložit (data se nezměnila) – ' + new Date().toLocaleTimeString('cs-CZ'); netBar(); }
}
async function api(name, opt) {
  const r = await fetch(API + name, { credentials: 'same-origin', cache: 'no-store', ...opt });
  let j = {}; try { j = await r.json(); } catch { }
  return { ok: r.ok, status: r.status, j };
}
async function push(patch) {
  syncing = true;
  try {
    const { ok, status, j } = await api('state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch }) });
    if (ok) { netErr = ''; lastSave = `OK v ${new Date().toLocaleTimeString('cs-CZ')} (uloženo: ${Object.keys(patch).join(', ')})`; netBar(); apply(j.state, j.rev); return true; }
    netErr = status === 401 ? 'Přihlášení vypršelo – přihlaste se prosím znovu.'
      : j.error === 'forbidden_key' ? `Server odmítl uložit „${j.key}". Nahrajte na server nový api.php (viz README).`
      : j.error === 'not_writable' ? `Server nemůže zapisovat do složky ${j.dir}. Nastavte složce práva 755 (nebo 775).`
      : `Uložení na server se nezdařilo (${j.error || status}).`;
  } catch (e) { netErr = 'Server není dostupný, změna se neuložila. ' + ((e && e.message) || ''); }
  lastSave = 'CHYBA: ' + netErr; syncing = false; netBar(); render(true); return false;
}
function apply(st, newRev) { // stav ze serveru -> aplikace
  syncing = false;
  if (!st) return;
  rev = newRev; mirror = structuredClone(st); S = fromServer(st);
  checkAlarms();
  render(true);
}
async function sync() {
  if (syncing || !U) return;
  try {
    const { ok, status, j } = await api(`state&rev=${rev}`);
    if (status === 401) { U = null; location.reload(); return; }
    if (!ok) return;
    netErr = ''; netBar();
    if (j.presence) presence = j.presence;
    if (!j.same) apply(j.state || {}, j.rev); else render(true);
    checkPre(j.prealert);
  } catch { netErr = 'Server není dostupný – data se neaktualizují.'; netBar(); render(true); }
}

/* ===== Zvuk: gongy a TTS ===== */
let ctx;
const AC = () => ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)());

function synth() { // výchozí gong, pokud není nahrán vlastní
  const c = AC(), t = c.currentTime, g = c.createGain();
  g.gain.setValueAtTime(Math.max(S.settings.vol, 0.01), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
  g.connect(c.destination);
  [220, 330, 440].forEach(f => { const o = c.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 2.5); });
  return new Promise(r => setTimeout(r, 2600));
}
const play = src => new Promise(r => {
  let done = false; const fin = () => { if (!done) { done = true; clearTimeout(tm); r(); } };
  const tm = setTimeout(fin, 20000); // poškozený zvuk nesmí zablokovat hlášení
  const a = new Audio(src); a.volume = S.settings.vol;
  a.onended = a.onerror = a.onstalled = fin;
  const p = a.play(); if (p && p.catch) p.catch(fin);
});
const rxEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function spell(text) { // zkratky se přečtou celým slovem podle tabulky (Admin → Výslovnost)
  let out = String(text);
  const list = (S.pron || []).filter(p => p.from && p.to).sort((a, b) => b.from.length - a.from.length);
  for (const p of list) {
    let re;
    try { re = new RegExp(`([^\\p{L}\\p{N}]|^)(${rxEsc(p.from)})(?![\\p{L}\\p{N}])`, 'giu'); }
    catch { re = new RegExp(`([^A-Za-z0-9]|^)(${rxEsc(p.from)})(?![A-Za-z0-9])`, 'gi'); }
    out = out.replace(re, (m, pre) => pre + p.to);
  }
  return out;
}
/* České hlasy se načítají až chvíli po startu stránky – musíme na ně počkat, jinak mluví anglicky */
let voices = [], voicesDone = false, tipShown = false;
const LINUX_HELP = 'Linux: prohlížeče berou hlasy ze speech-dispatcheru. Nainstalujte ho s českým hlasem a restartujte prohlížeč:\n'
  + '• Debian/Ubuntu/Mint:  sudo apt install speech-dispatcher espeak-ng\n'
  + '• Fedora:  sudo dnf install speech-dispatcher espeak-ng\n'
  + '• Arch:  sudo pacman -S speech-dispatcher espeak-ng\n'
  + 'Ověření v terminálu:  spd-say -l | grep cs     a zkouška:  spd-say -l cs "zkouška"\n'
  + 'Ve Firefoxu musí být v about:config zapnuté media.webspeech.synth.enabled (výchozí je zapnuto).\n'
  + 'Hezčí český hlas: nainstalujte balíček RHVoice, nebo v Chrome ponechte online hlasy Google (vyžadují internet).';
const getV = () => { try { return speechSynthesis.getVoices() || []; } catch { return []; } };
function loadVoices() {
  return new Promise(res => {
    voices = getV();
    if (voices.length) { voicesDone = true; return res(voices); }
    let fired = false;
    const fin = () => { if (fired) return; fired = true; voices = getV(); voicesDone = true; res(voices); };
    try { speechSynthesis.addEventListener('voiceschanged', fin, { once: true }); } catch { }
    setTimeout(fin, 2000);
  });
}
const lng = v => String(v.lang || '').replace('_', '-').toLowerCase();
const isCzech = v => lng(v).startsWith('cs') || /česk|czech|zuzana|jakub|vlasta/i.test(v.name || '');
function osHelp() { // návod podle systému, kde uživatel sedí
  const u = navigator.userAgent, p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  if (/Android/i.test(u)) return 'Android: Nastavení → Usnadnění → Převod textu na řeč → u Google TTS stáhněte češtinu.';
  if (/iPhone|iPad|iPod/i.test(u)) return 'iPhone/iPad: Nastavení → Zpřístupnění → Mluvený obsah → Hlasy → Čeština.';
  if (/Mac/i.test(p) || /Mac OS X/i.test(u)) return 'macOS: Nastavení → Zpřístupnění → Mluvený obsah → Systémový hlas → Spravovat hlasy → Čeština (Zuzana).';
  if (/Linux|X11|CrOS/i.test(p) || /Linux|X11/i.test(u)) return LINUX_HELP;
  return 'Windows: Nastavení → Čas a jazyk → Řeč → Spravovat hlasy → Přidat hlasy → Čeština. Pak restartujte prohlížeč.';
}
function pickVoice() { // ručně vybraný hlas má přednost, jinak první český
  const want = String(S.settings.voice || '').trim();
  if (want) { const v = voices.find(x => x.name === want); if (v) return v; }
  return voices.find(v => lng(v) === 'cs-cz') || voices.find(isCzech) || null;
}
async function say(text) {
  if (!S.settings.tts || !('speechSynthesis' in window)) return;
  if (!voicesDone) await loadVoices();
  await new Promise(r => {
    let done = false; const fin = () => { if (!done) { done = true; clearTimeout(tm); r(); } };
    const tm = setTimeout(fin, 30000); // kdyby hlas selhal, poplach se nezasekne
    const u = new SpeechSynthesisUtterance(spell(text));
    const v = pickVoice();
    u.lang = v ? (v.lang || 'cs-CZ') : 'cs-CZ';
    if (v) u.voice = v;
    u.rate = S.settings.rate; u.volume = S.settings.vol;
    u.onend = u.onerror = fin;
    try { speechSynthesis.cancel(); } catch { }
    speechSynthesis.speak(u);
    try { speechSynthesis.resume(); } catch { } // Chrome občas začne v pauze
  });
}

/* Pořadí: pre-gong dle typu události → hlavní gong → TTS */
let alarmTok = 0;
async function runAlarm(c, names, all) {
  const tok = ++alarmTok;
  banner(c, all || names); // pruh bez tlačítka – výjezd se nepotvrzuje ani neodmítá
  try { // pre-gong zazní jen při předhlášení, tady už ne
    if (S.settings.gong) await play(S.settings.gong); else await synth();
    await say(`Pozor, výjezd. ${c.typeName}${c.sub ? ', ' + c.sub : ''}. ${c.addr}${c.town ? ', ' + c.town : ''}. ${c.note ? c.note + '. ' : ''}Vyjíždí: ${names.join(', ')}.`);
  } finally { setTimeout(() => { if (tok === alarmTok) $('#alarm').hidden = true; }, 8000); }
}
let queue = Promise.resolve();
const pushAlarm = (c, units) => { (c.alarms = c.alarms || []).push({ t: Date.now(), u: units.slice() }); c.alarms = c.alarms.slice(-10); };
function checkPre(p) { // pre-gong pro vybrané jednotky, ještě než dispečer výjezd vyhlásí
  const first = seenPre === null;
  if (!p || !p.t) { if (first) seenPre = 0; return; }
  if (first) { seenPre = p.t; return; } // po přihlášení staré předhlášení nepřehráváme
  if (p.t <= seenPre) return;
  seenPre = p.t;
  const me = getVeh();
  if (!me || !(p.units || []).includes(me)) return;
  const t = S.types.find(x => x.id === p.type);
  if (!t || !t.pre) return; // bez nahraného pre-gongu se nepřehraje nic
  queue = queue.then(() => play(t.pre)).catch(() => { });
}
function checkAlarms() { // po synchronizaci: zazní poplach pro mé vozidlo
  const first = seenAlarms === null; if (first) seenAlarms = new Set();
  const me = getVeh();
  for (const c of S.calls) for (const a of (c.alarms || [])) {
    const key = c.no + ':' + a.t;
    if (seenAlarms.has(key)) continue;
    seenAlarms.add(key);
    if (first || !me || !(a.u || []).includes(me)) continue;
    // hlášení čte jen jednotky z mé sekce, ostatní jsou vidět na obrazovce
    const mySec = (S.vehicles.find(v => v.id === me) || {}).sec;
    const mine = (a.u || []).filter(id => (S.vehicles.find(v => v.id === id) || {}).sec === mySec);
    const names = (mine.length ? mine : [me]).map(vname);
    const all = (a.u || []).map(vname);
    mycall = c.no; ctab = 'notes'; // karta události se otevře sama
    if (tab !== 'fire' && tab !== 'commander') tab = can('commander') ? 'commander' : 'fire';
    queue = queue.then(() => runAlarm(c, names, all)).catch(() => { });
  }
}
function banner(c, names) {
  const a = $('#alarm'); a.hidden = false;
  a.innerHTML = `<b>Výjezd</b><span class="caddr">${esc(tl(c))} · ${esc(c.addr)}</span>${c.note ? `<span>${esc(c.note)}</span>` : ''}<div class="chips">${names.map(n => `<span class="chip">${esc(n)}</span>`).join('')}</div>`;
}

function ping() { // krátké zvukové upozornění dispečera na novou zprávu od velitele
  try { const c = AC(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = Math.max(S.settings.vol, 0.05) * 0.3; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.18); } catch { }
}

/* ===== Přihlášení (Discord OAuth2 + role) ===== */
const err = m => { $('#err').textContent = m || ''; };
let ENV = { loaded: false, clientId: '', guildId: '', redirect: '', demo: false, roles: {}, backup: {}, ping: {} };
const redirUrl = () => ENV.redirect || new URL('callback.html', location.origin + location.pathname).href;
async function loadEnv() { // nastavení z .env na serveru (bez tajných hodnot)
  try { const r = await fetch('api.php?r=config', { cache: 'no-store' }); if (!r.ok) throw 0; ENV = { ...ENV, ...(await r.json()), loaded: true }; }
  catch { ENV.loaded = false; }
  $('#demo').hidden = !ENV.demo;
  if (!ENV.loaded && !U) err('Server není dostupný. Nepodařilo se spojit s api.php (nebo node server.js) – viz README.');
  render(true);
}
async function login(u) { U = u; await sync(); start(); } // relace drží server v cookie, nic se neukládá do prohlížeče
$('#dc').onclick = () => {
  if (!consentOk()) return showGate();
  sessionStorage['cad.oa.rem'] = remOn() ? '1' : '0'; // jen pro návrat z Discordu, hned se maže
  if (!ENV.loaded) return err('Server není dostupný. Nepodařilo se spojit s api.php (nebo node server.js) – viz README.');
  if (!ENV.clientId || !ENV.guildId) return err('Discord není nastaven – vyplňte DISCORD_CLIENT_ID a DISCORD_GUILD_ID v souboru .env na serveru.');
  const st = crypto.randomUUID(); sessionStorage['cad.oa'] = st;
  location.href = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
    client_id: ENV.clientId, response_type: 'token', redirect_uri: redirUrl(), scope: 'identify guilds.members.read', state: st
  });
};
$('#dgo').onclick = async () => {
  if (!ENV.demo) return;
  if (!consentOk()) return showGate();
  const n = $('#dn').value.trim() || 'Demo';
  try {
    const { ok, j } = await api('session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demo: true, name: n, role: $('#dr').value, terms: true, remember: remOn() }) });
    if (!ok) return err(j.error === 'demo_disabled' ? 'Demo režim je na serveru vypnut (ALLOW_DEMO v cad.env.php).' : 'Demo přihlášení se nezdařilo.');
    await login(j.user);
  } catch { err('Server není dostupný.'); }
};
$('#out').onclick = async () => { try { await api('logout', { method: 'POST' }); } catch { } location.reload(); };

/* ===== Vykreslení ===== */
const TABS = [['fire', 'Hasič'], ['commander', 'Velitel'], ['dispatch', 'Dispečink'], ['history', 'Historie'], ['admin', 'Admin']];
function ensurePerson() { // osobu zakládá server při přihlášení; tady jen převezmeme jméno ze seznamu
  const p = S.people.find(x => x.did && x.did === U.id);
  if (p && p.name) U.name = p.name;
}
function start() {
  $('#login').hidden = true; $('#app').hidden = false;
  ensurePerson();
  $('#who').textContent = U.name;
  const av = $('#appv'); if (av) av.textContent = 'v' + APPV; else netBar(); // chybí-li odznak, je index.html starý
  if (!tab || !canTab(tab)) tab = (TABS.find(([k]) => canTab(k)) || [''])[0];
  render(); enter(); beat(); voiceTip();
}
function render(soft) {
  if (!U) return;
  const a = document.activeElement;
  if (soft && view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { dirty = 1; return; }
  dirty = 0;
  $('#srv').textContent = S.settings.name; document.title = S.settings.name;
  $('#tabs').innerHTML = TABS.filter(([k]) => canTab(k)).map(([k, l]) => `<button data-v="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('');
  view.innerHTML = tab ? ({ fire: vFire, commander: vCmd, dispatch: vDisp, history: vHist, admin: vAdmin })[tab]() : '<p>Nemáte oprávnění.</p>';
  S.calls.forEach(c => seen.add(c.no));
  updateVideo();
  if (tab === 'admin' && at === 'dc') checkExposure();
}
view.addEventListener('focusout', () => { if (dirty) setTimeout(() => render(true)); });
$('#tabs').onclick = e => { const b = e.target.closest('button'); if (b) { tab = b.dataset.v; render(); enter(); } };

const chip = u => `<span class="chip">${u.call ? `<b>${esc(u.call)}</b>` : ''}<span>${esc(u.name)}</span>${u.sub ? `<small>${esc(u.sub)}</small>` : ''}</span>`;
const chips = c => `<div class="chips">${(c.unitInfo || c.unitNames.map(name => ({ name }))).map(chip).join('')}</div>`;
const seen = new Set(S.calls.map(c => c.no));
const tl = c => c.typeName + (c.sub ? ' - ' + c.sub : '');
const ts = t => new Date(t).toLocaleTimeString('cs-CZ');
const tm = t => new Date(t).toLocaleString('cs-CZ');
const fd = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`; };
const noteList = c => { const n = (c.log || []).filter(x => x.k === 'note'); return n.length ? `<div class="notes">${n.map(x => `<div class="note"><small class="muted">${ts(x.t)} · ${esc(x.veh || '')} · ${esc(x.by)}</small><span>${esc(x.text)}</span></div>`).join('')}</div>` : ''; };
const enter = () => { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); setTimeout(() => view.classList.remove('enter'), 800); };
const callHtml = (c, ctl) => `<article class="call${seen.has(c.no) ? '' : ' fresh'}"><div class="chead"><span class="cno">#${esc(c.no)}</span><b>${esc(tl(c))}${c.title ? ' – ' + esc(c.title) : ''}</b>${c.status === 'pending' ? '<span class="pill p2">Čeká na výjezd</span>' : ''}<small class="muted">${new Date(c.t).toLocaleTimeString('cs-CZ')} · ${esc(c.by)}</small></div><div class="caddr">${esc(c.addr)}</div>${c.note ? `<div class="muted">${esc(c.note)}</div>` : ''}${chips(c)}${noteList(c)}${ctl ? `<div class="btns">${c.status === 'pending' ? `<button class="primary" data-act="launch" data-no="${esc(c.no)}">Vyhlásit poplach</button>` : `<button data-act="realarm" data-no="${esc(c.no)}">Opakovat poplach</button>`}${Object.keys(CALLIN).map(k => { const done = (c.called || []).some(x => x.k === k); return `<button data-act="callin" data-no="${esc(c.no)}" data-k="${k}">Povolat ${CALLIN[k]}${done ? ' (odesláno)' : ''}</button>`; }).join('')}<button data-act="editcall" data-no="${esc(c.no)}">Upravit</button><button data-act="close" data-no="${esc(c.no)}">Ukončit událost</button></div>` : ''}</article>`;
const crewTxt = id => { const n = S.people.filter(p => p.vid === id).length; return n ? `${n} ${n === 1 ? 'člen' : n < 5 ? 'členové' : 'členů'} posádky` : 'bez posádky'; };
const pchip = (p, ctl) => `<span class="chip"><span class="dot ${online(p) ? 'on' : ''}" title="${online(p) ? 'online' : 'offline'}"></span>${p.call ? `<b>${esc(p.call)}</b>` : ''}<span>${esc(p.name)}</span>${ctl ? `<button class="x" data-act="unassign" data-id="${p.id}" aria-label="Odebrat z posádky">&#215;</button>` : ''}</span>`;
const unit = (v, foot = '', tag = 'div') => `<${tag} class="unit u${v.st}"><div class="ucall">${esc(v.call || '—')}</div><div class="uinfo"><b>${esc(v.name)}</b>${v.type ? `<span class="utype">${esc(v.type)}</span>` : ''}${v.sub ? `<span class="usub">${esc(v.sub)}</span>` : ''}<small class="muted">${esc(v.station)}</small><small class="muted">${crewTxt(v.id)}</small>${v.stt ? `<small class="muted">Stav od ${ts(v.stt)}</small>` : ''}</div><div class="ufoot">${foot}</div></${tag}>`;
const stSel = v => `<select data-act="stv" data-id="${v.id}">${ST.map((n, i) => `<option value="${i}" ${i === v.st ? 'selected' : ''}>${n}</option>`).join('')}</select>`;

const pill = u => `<span class="pill p${u.st}">${ST[u.st]}${u.stt ? ' · ' + ts(u.stt) : ''}</span>`;
function cp(title, badges, head, rows, empty) {
  return `<section class="cp"><div class="cph"><b>${title}</b>${badges}</div><div class="wrap"><table class="ct"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.join('')}</table></div>${rows.length ? '' : `<div class="cempty">${empty}</div>`}</section>`;
}
const urow = (u, vid) => `<tr class="${u.id === vid ? 'me' : ''}"><td><b>${esc(u.call)}</b></td><td>${esc(u.name)}</td><td>${esc(u.station)}</td><td>${esc(u.type)}</td><td>${esc(u.sub)}</td><td>${pill(u)}</td></tr>`;
function cadPanels(vid, showUnits) { // hasič seznam vozidel nevidí, velitel ano
  const calls = S.calls.filter(c => !c.closed && c.status !== 'pending' && c.units.includes(vid));
  const hist = S.calls.filter(c => c.closed && c.units.includes(vid)).length;
  const crew = S.people.filter(p => p.vid === vid);
  return cp('Aktivní výjezdy', `<span class="cb r">aktivní ${calls.length}</span><span class="cb">historie ${hist}</span>`,
      ['ID', 'Typ události', 'Adresa', 'Poznámka', 'Jednotky', 'Stav'],
      calls.map(c => `<tr class="hot click" tabindex="0" data-act="opencall" data-no="${esc(c.no)}"><td>#${esc(c.no)}</td><td>${esc(tl(c))}${c.title ? `<br><small class="muted">${esc(c.title)}</small>` : ''}</td><td>${esc(c.addr)}</td><td>${esc(c.note)}</td><td>${esc((c.unitInfo ? c.unitInfo.map(u => u.call || u.name) : c.unitNames).join(', '))}</td><td><span class="pill p1">Výjezd · ${ts(c.t)}</span></td></tr>`),
      'Žádné aktivní výjezdy')
    + (!showUnits ? '' : (bySec(S.vehicles).map(([s, vs]) => cp(esc(s.name), `<span class="cb">${vs.length}</span>`, ['Volačka', 'Název', 'Stanice', 'Typ', 'Podtext', 'Stav'], vs.map(u => urow(u, vid)), '')).join('')
      || cp('Aktivní jednotky', '', ['Volačka', 'Název', 'Stanice', 'Typ', 'Podtext', 'Stav'], [], 'Žádné jednotky')))
    + cp('Moje posádka', `<span class="cb">${crew.length}</span>`,
      ['Jméno', 'Osobní číslo', 'Hodnost', 'Stav'],
      crew.map(p => `<tr><td><span class="dot ${online(p) ? 'on' : ''}"></span> ${esc(p.name)}</td><td>${esc(p.call)}</td><td>${esc(p.rank)}</td><td><span class="pill ${online(p) ? 'p0' : 'p4'}">${online(p) ? 'Online' : 'Offline'}</span></td></tr>`),
      vid ? 'Posádka je prázdná' : 'Nemáte přiřazené vozidlo – počkejte na zařazení dispečerem');
}
function vFire() { return (mycall && myCall(mycall, false)) || cadPanels(getVeh(), false); }
function vCmd() {
  const mc = mycall && myCall(mycall, true); if (mc) return mc;
  const vid = getVeh(), v = S.vehicles.find(x => x.id === vid);
  const calls = S.calls.filter(c => !c.closed && c.status !== 'pending' && c.units.includes(vid));
  const ctl = v ? `<div class="cbody"><h3>Odeslat stav jednotky</h3><div class="btns">${ST.map((n, i) => `<button data-act="st" data-id="${v.id}" data-v="${i}" class="${i === v.st ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${calls.map(c => `<h3>Zpráva dispečerovi · #${esc(c.no)} ${esc(tl(c))}</h3><form data-act="note" data-no="${esc(c.no)}" class="noteform"><input name="text" required maxlength="300" placeholder="Poznámka k události…" aria-label="Zpráva pro dispečera"><button class="primary">Odeslat dispečerovi</button></form>${noteList(c)}`).join('')}</div>`
    : '<div class="cempty">Nemáte přiřazenou jednotku – přidělí vám ji dispečer.</div>';
  return `<section class="cp"><div class="cph"><b>Ovládání jednotky</b></div>${ctl}</section>` + cadPanels(vid, true);
}
function vHist() {
  let list = S.calls.slice().reverse();
  if (!can('dispatch')) list = list.filter(c => c.units.includes(getVeh()));
  return `<section class="card"><h2>Historie událostí</h2>${list.length ? `<div class="wrap"><table><tr><th>Číslo</th><th>Typ</th><th>Adresa</th><th>Vznik</th><th>Konec</th><th>Stav</th></tr>
    ${list.map(c => `<tr class="click" tabindex="0" data-act="detail" data-no="${esc(c.no)}"><td>#${esc(c.no)}</td><td>${esc(tl(c))}</td><td>${esc(c.addr)}</td><td>${tm(c.t)}</td><td>${c.end ? tm(c.end) : '—'}</td><td><span class="st ${c.closed ? 's4' : c.status === 'pending' ? 's2' : 's1'}">${c.closed ? 'Archivováno' : c.status === 'pending' ? 'Čeká' : 'Probíhá'}</span></td></tr>`).join('')}</table></div><p class="muted">Kliknutím na událost zobrazíte podrobnosti.</p>` : '<p class="muted">Zatím nebyla vyhlášena žádná událost.</p>'}</section>`;
}
function showDetail(no) {
  const c = S.calls.find(x => x.no === no), d = $('#detail'); if (!c || d.open) return;
  const log = (c.log && c.log.length ? c.log : [{ t: c.t, k: 'create', text: 'Událost vytvořena', by: c.by }]).slice().sort((a, b) => a.t - b.t);
  const notes = log.filter(x => x.k === 'note');
  d.innerHTML = `<h2>#${esc(c.no)} · ${esc(tl(c))}</h2><p class="caddr">${esc(c.addr)}${c.town ? ', ' + esc(c.town) : ''}</p>${c.note ? `<p class="muted">Poznámka dispečera: ${esc(c.note)}</p>` : ''}
    <div class="kv"><span class="muted">Vznik</span><b>${tm(c.t)}</b><span class="muted">Konec</span><b>${c.end ? tm(c.end) : 'probíhá'}</b><span class="muted">Trvání</span><b>${fd((c.end || Date.now()) - c.t)}</b></div>
    ${chips(c)}
    <h3>Poznámky velitele</h3>${notes.map(x => `<div class="note"><small class="muted">${ts(x.t)} · ${esc(x.veh || '')} · ${esc(x.by)}</small><span>${esc(x.text)}</span></div>`).join('') || '<p class="muted">Žádné poznámky.</p>'}
    <h3>Časová osa</h3><ol class="tl">${log.map(x => `<li><time>${ts(x.t)}</time><span>${esc(x.text)}</span>${x.by ? `<small class="muted">${esc(x.by)}</small>` : ''}</li>`).join('')}</ol>
    <form method="dialog"><button class="primary">Zavřít</button></form>`;
  d.showModal();
}
function vCrew() { // stav vozidla i jeho posádka na jednom místě
  const free = S.people.filter(p => !S.vehicles.some(v => v.id === p.vid));
  const foot = v => `${stSel(v)}<div class="crew"><div class="chips">${S.people.filter(p => p.vid === v.id).map(p => pchip(p, 1)).join('') || '<span class="muted">Bez posádky</span>'}</div>
    <select data-act="addcrew" data-vid="${v.id}" aria-label="Přidat člena posádky"><option value="">+ Přidat člena posádky…</option>${free.map(p => `<option value="${p.id}">${esc(p.name)}${p.call ? ' (' + esc(p.call) + ')' : ''}</option>`).join('')}</select></div>`;
  const busy = v => S.calls.some(c => !c.closed && c.status !== 'pending' && c.units.includes(v.id));
  return `<section class="card"><h2>Jednotky</h2>
    ${bySec(S.vehicles).map(([s, vs]) => `<details class="secbox" data-sec="j${esc(s.id)}" ${(secOpen['j' + s.id] !== undefined ? secOpen['j' + s.id] : vs.some(busy)) ? 'open' : ''}><summary>${esc(s.name)}<span class="cb">${vs.length}</span>${vs.some(busy) ? '<b class="selc">na výjezdu</b>' : ''}</summary><div class="secin"><div class="units">${vs.map(v => unit(v, foot(v))).join('')}</div></div></details>`).join('') || '<span class="muted">Žádná vozidla – přidejte je v Admin.</span>'}
    <h3>Nepřiřazení hasiči (${free.length})</h3>
    <div class="pool">${free.map(p => `<div class="person"><span class="dot ${online(p) ? 'on' : ''}"></span><div><b>${esc(p.name)}</b><br><small class="muted">${esc([p.rank, p.call].filter(Boolean).join(' · ') || (online(p) ? 'online' : 'offline'))}</small></div>
      <select data-act="setveh" data-pid="${p.id}" aria-label="Přiřadit k vozidlu"><option value="0">Přiřadit k vozidlu…</option>${S.vehicles.map(v => `<option value="${v.id}">${esc(v.call)} · ${esc(v.name)}</option>`).join('')}</select></div>`).join('') || '<span class="muted">Všichni hasiči jsou zařazeni (nebo je seznam Osoby prázdný).</span>'}</div></section>`;
}
function vDisp() {
  const open = S.calls.filter(c => !c.closed);
  return `<section class="card bar"><h2>Dispečink</h2><button class="go" data-act="newcall">+ Nový výjezd</button></section>
    <section class="card"><h2>Aktivní události</h2>${open.map(c => callHtml(c, 1)).join('') || '<p class="muted">Žádná aktivní událost.</p>'}</section>
    ${vCrew()}`;
}

const fval = v => (Array.isArray(v) ? v.join(', ') : v);
const bySec = list => { const ids = S.sections.map(s => s.id); return [...S.sections, { id: 0, name: 'Bez sekce' }].map(s => [s, list.filter(v => (s.id ? v.sec === s.id : !ids.includes(v.sec)))]).filter(([, vs]) => vs.length); };
const secOpts = () => [['0', '— bez sekce —'], ...S.sections.map(s => [String(s.id), s.name])];
const povOpts = [['', '— nepovolávat —'], ...Object.keys(CALLIN).map(k => [k, CALLIN[k]])];
// vozidlo lze povolat, když je tak označené u sebe, nebo když leží v sekci toho druhu
const canCall = (v, k) => v.pov === k || (!v.pov && (S.sections.find(s => s.id === v.sec) || {}).kind === k);
const FIELDS = {
  types: [['name', 'Název události'], ['subs', 'Podtypy (oddělené čárkou)']],
  people: [['name', 'Jméno'], ['call', 'Osobní číslo'], ['did', 'Discord ID'], ['rank', 'Hodnost']],
  vehicles: [['name', 'Název vozidla'], ['call', 'Volačka'], ['type', 'Typ (např. CAS)'], ['sub', 'Podtext (např. První výjezd)'], ['station', 'Stanice'], ['pov', 'Povolávat jako', povOpts], ['sec', 'Sekce', secOpts]],
  pron: [['from', 'Zkratka'], ['to', 'Jak se má přečíst']],
  sections: [['name', 'Název sekce'], ['kind', 'Druh sekce', [['hzs', 'Běžná jednotka (HZS)'], ['zu', 'Záchranný útvar (ZÚ)'], ['jsdh', 'JSDH'], ['tm', 'TM'], ['zpp', 'ZPP']]]],
};
const optList = o => (typeof o === 'function' ? o() : o);
function crud(k) {
  const F = FIELDS[k], e = ed[k] ? S[k].find(x => x.id === ed[k]) : null;
  const cols = F.filter(f => !(k === 'vehicles' && f[0] === 'sec'));
  const cell = (x, f) => { const o = f[2] ? optList(f[2]).find(q => String(q[0]) === String(x[f[0]])) : null; return esc(o ? o[1] : fval(x[f[0]])); };
  const rows = list => list.map(x => `<tr>${cols.map(f => `<td>${cell(x, f)}</td>`).join('')}${k === 'pron' ? `<td><button data-act="tsay" data-id="${x.id}">Zkouška</button></td>` : ''}${k === 'types' ? `<td><div class="btns">${x.pre ? `<span class="pill p0">nahrán</span> <button data-act="tpre" data-id="${x.id}">Přehrát</button> <button data-act="rmpre" data-id="${x.id}">Odebrat</button>` : '<span class="muted">nenastaven</span>'}<input type="file" accept="audio/*" data-act="pre" data-id="${x.id}"></div></td>` : ''}
    <td><div class="btns"><button data-act="edit" data-k="${k}" data-id="${x.id}">Upravit</button><button data-act="del" data-k="${k}" data-id="${x.id}">Smazat</button></div></td></tr>`).join('');
  const table = list => `<div class="wrap"><table><tr>${cols.map(f => `<th>${f[1]}</th>`).join('')}${k === 'pron' ? '<th></th>' : ''}${k === 'types' ? '<th>Pre-gong tohoto typu</th>' : ''}<th></th></tr>${rows(list)}</table></div>`;
  const input = ([f, l, o]) => o
    ? `<label>${l}<select name="${f}">${optList(o).map(([v, t]) => `<option value="${esc(v)}" ${String(e ? e[f] : optList(o)[0][0]) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`
    : `<label>${l}<input name="${f}" value="${esc(e ? fval(e[f]) : '')}" maxlength="80" ${f === F[0][0] ? 'required' : ''}></label>`;
  return `<form data-act="crud" data-k="${k}" class="grid">${F.map(input).join('')}<div class="btns"><button class="primary">${e ? 'Uložit změny' : 'Přidat'}</button>${e ? `<button type="button" data-act="cancel" data-k="${k}">Zrušit</button>` : ''}</div></form>
  ${k === 'vehicles' ? (bySec(S.vehicles).map(([s, vs]) => `<h3>${esc(s.name)} <span class="cb">${vs.length}</span></h3>${table(vs)}`).join('') || '<p class="muted">Žádná vozidla.</p>') : table(S[k])}`;
}
function aServer() {
  const s = S.settings;
  return `<h2>Server</h2><form data-act="srv" class="grid">
    <label>Název serveru<input name="name" value="${esc(s.name)}" maxlength="60"></label>
    <label><span class="rhead">Hlasitost<output>${Math.round(s.vol * 100)} %</output></span><input type="range" name="vol" min="0" max="1" step="0.05" value="${s.vol}"></label>
    <label><span class="rhead">Rychlost hlasového hlášení<output>×${s.rate}</output></span><input type="range" name="rate" min="0.5" max="1.5" step="0.1" value="${s.rate}"></label>
    <label class="chk"><input type="checkbox" name="tts" ${s.tts ? 'checked' : ''}> Hlasové hlášení (TTS)</label>
    <label class="wide">Hlas pro hlášení<select name="voice"><option value="">Automaticky (první český hlas)</option>${voices.map(v => `<option value="${esc(v.name)}" ${s.voice === v.name ? 'selected' : ''}>${esc(v.name)} — ${esc(v.lang)}${isCzech(v) ? ' ✓ česky' : ''}</option>`).join('')}</select></label>
    <label class="wide">Video do rohu v dispečinku (soubor nebo adresa)<input name="video" value="${esc(s.video)}" placeholder="media/subway-surfers.mp4"></label>
    <label class="wide">Podmínky používání (zobrazují se při přihlášení)<textarea name="terms" rows="6" maxlength="3000">${esc(s.terms)}</textarea></label>
    <button class="primary">Uložit nastavení</button></form>
    ${voicesDone && !voices.some(isCzech) ? `<div class="warn"><b>Chybí český hlas.</b> <span class="muted">Hlášení bude znít cizím přízvukem. Hlasy jsou vlastní pro každý počítač, návod musí projít každý uživatel u sebe.</span><details><summary>Jak hlas nainstalovat</summary><pre>${esc(osHelp())}</pre></details></div>` : ''}
    <h3>Hlavní gong</h3><p class="muted">${s.gong ? 'Je nahraný vlastní gong.' : 'Používá se výchozí gong.'} Přehraje se po pre-gongu a před hlášením.</p>
    <div class="btns"><input type="file" accept="audio/*" data-act="gong"><button data-act="tgong">Test gongu</button>${s.gong ? '<button data-act="rmgong">Odebrat vlastní gong</button>' : ''}<button data-act="ttts">Test hlášení</button></div>
    <h3>Diagnostika</h3>
    <div class="wrap"><table>
      <tr><td>Verze aplikace</td><td><code>v${APPV}</code></td></tr>
      <tr><td>Spojení se serverem</td><td>${ENV.loaded ? '<span class="pill p0">OK</span>' : '<span class="pill p1">nedostupné</span>'}</td></tr>
      <tr><td>Verze dat na serveru</td><td><code>rev ${esc(rev)}</code></td></tr>
      <tr><td>Poslední ukládání</td><td><code>${esc(lastSave)}</code></td></tr>
      <tr><td>Zkratek ve výslovnosti</td><td><code>${(S.pron || []).length}</code></td></tr>
    </table></div>
    <div class="btns"><button data-act="diag">Otestovat zápis na server</button></div>
    <p class="muted">Zvuky se ukládají na server do složky <code>media/sounds</code> (max. 8 MB na soubor) a slyší je všichni uživatelé. Pre-gongy se nastavují u typů událostí.</p>`;
}
let expoRes = null, expoBusy = false;
async function checkExposure() { // ověří, že se tajné soubory nedají stáhnout z prohlížeče
  const put = h => { const el = $('#expo'); if (el) el.innerHTML = h; };
  if (expoRes) return put(expoRes);
  if (expoBusy) return; expoBusy = true;
  const bad = [];
  for (const f of ['.env', 'cad.env', 'cad.env.php', 'server.js', '.htaccess']) {
    try { const r = await fetch(f + '?t=' + Date.now(), { cache: 'no-store' }); if (r.ok && /(WEBHOOK_|DISCORD_|SESSION_SECRET|PING_|ALLOW_DEMO|createServer|FilesMatch)/.test(await r.text())) bad.push(f); } catch { }
  }
  expoRes = bad.length
    ? `<div class="warn"><b>Pozor:</b> tyto soubory jsou veřejně dostupné z prohlížeče: <code>${bad.map(esc).join(', ')}</code>. Okamžitě je zablokujte (.htaccess) nebo přesuňte mimo veřejnou složku a změňte webhooky i SESSION_SECRET.</div>`
    : '<p><span class="pill p0">Zabezpečeno</span> Soubory s tajnými hodnotami (.env, cad.env, server.js …) nejdou z prohlížeče stáhnout.</p>';
  expoBusy = false; put(expoRes);
}
function aDc() {
  const e = ENV, on = b => `<span class="pill ${b ? 'p0' : 'p4'}">${b ? 'Nastaveno' : 'Chybí'}</span>`;
  if (!e.loaded) return '<h2>Discord a webhooky</h2><p class="muted">Server není dostupný, nastavení z cad.env nelze načíst.</p>';
  const inv = e.clientId ? 'https://discord.com/oauth2/authorize?' + new URLSearchParams({ client_id: e.clientId, scope: 'bot', permissions: '0', ...(e.guildId ? { guild_id: e.guildId, disable_guild_select: 'true' } : {}) }) : '';
  const row = (l, st, v) => `<tr><td>${l}</td><td><code>${v}</code></td><td>${st}</td></tr>`;
  const names = { admin: 'Administrátor', dispatch: 'Dispečer', fire: 'Hasič', commander: 'Velitel' };
  const warns = [];
  if (!e.envFound) warns.push('Soubor cad.env nebyl nalezen – nahrajte ho o úroveň výš, mimo veřejnou složku (viz README).');
  if (e.envInside) warns.push('Soubor s nastavením leží ve veřejné složce webu. Přesuňte ho o úroveň výš, mimo veřejnou složku.');
  if (e.demo) warns.push('Demo režim je zapnutý – kdokoli se může přihlásit jako administrátor. Na veřejném webu nastavte ALLOW_DEMO=false.');
  if (!e.secret) warns.push('Chybí SESSION_SECRET (alespoň 16 náhodných znaků) – bez něj se nikdo nepřihlásí.');
  return `<h2>Discord a webhooky</h2>
    ${warns.map(w => `<div class="warn">${esc(w)}</div>`).join('')}
    <div id="expo" class="muted">Probíhá kontrola zabezpečení…</div>
    <p class="muted">Tato nastavení se čtou ze souboru <b>cad.env</b> na serveru. Změníte je úpravou souboru (přes FTP). Webhooky ani tajné hodnoty se do prohlížeče neposílají.</p>
    <p class="muted">Redirect URL pro Discord Developer Portal → OAuth2 → Redirects (musí se shodovat přesně):</p>
    <p><b>${esc(redirUrl())}</b> <button type="button" data-act="copy" data-t="${esc(redirUrl())}">Kopírovat</button></p>
    <p>${inv ? `<a class="btn" href="${esc(inv)}" target="_blank" rel="noopener">Přidat bota na server</a>` : '<span class="muted">Po nastavení DISCORD_CLIENT_ID se zobrazí odkaz pro přidání bota na server.</span>'}</p>
    <div class="wrap"><table><tr><th>Nastavení</th><th>Proměnná v cad.env</th><th>Stav</th></tr>
      ${row('Tajný klíč relací', on(e.secret), 'SESSION_SECRET')}
      ${row('Client ID aplikace', on(e.clientId), 'DISCORD_CLIENT_ID')}
      ${row('ID Discord serveru', on(e.guildId), 'DISCORD_GUILD_ID')}
      ${Object.keys(names).map(k => row('Role – ' + names[k], on(e.roles[k]), 'DISCORD_ROLE_' + k.toUpperCase())).join('')}
      ${Object.keys(CALLIN).map(k => row('Kanál – ' + CALLIN[k], on(e.backup[k]), 'WEBHOOK_' + k.toUpperCase() + (k === 'tm' || k === 'zpp' ? ' → WEBHOOK_DENNI' : '') + ' → WEBHOOK_DEFAULT')).join('')}
      ${Object.keys(CALLIN).map(k => row('Ping role – ' + CALLIN[k], on(e.ping[k]), 'PING_' + k.toUpperCase() + (k === 'tm' || k === 'zpp' ? ' (vlastní role, ne společná)' : ''))).join('')}
      ${row('Demo režim', `<span class="pill ${e.demo ? 'p2' : 'p0'}">${e.demo ? 'Zapnut' : 'Vypnut'}</span>`, 'ALLOW_DEMO')}
    </table></div>`;
}
function vAdmin() {
  const sub = [['server', 'Server'], ['types', 'Typy událostí'], ['people', 'Osoby'], ['sections', 'Sekce'], ['vehicles', 'Vozidla'], ['pron', 'Výslovnost'], ['dc', 'Discord']];
  const body = { server: aServer, types: () => `<h2>Typy událostí a pre-gongy</h2>${crud('types')}`, people: () => `<h2>Osoby</h2>${crud('people')}`, pron: () => `<h2>Výslovnost zkratek</h2><p class="muted">Hlasové hlášení přečte zkratku celým slovem. Platí pro všechny uživatele.</p>${crud('pron')}`, sections: () => `<h2>Sekce vozidel</h2><p class="muted">Sekce slouží jen k přehlednému rozdělení vozidel. Kdo se dá povolat jako posila, se nastavuje u jednotlivých vozidel v Admin → Vozidla ve sloupci „Povolávat jako“ – všechna vozidla tak můžou zůstat v jedné sekci. Druh sekce platí už jen pro vozidla, která vlastní nastavení nemají.</p>${crud('sections')}`, vehicles: () => `<h2>Vozidla</h2>${crud('vehicles')}`, dc: aDc }[at]();
  return `<div class="sub">${sub.map(([k, l]) => `<button data-act="at" data-v="${k}" class="${k === at ? 'on' : ''}">${l}</button>`).join('')}</div><section class="card">${body}</section>`;
}

/* ===== Akce ===== */
function closeCall(c, text) {
  c.closed = true; c.end = Date.now();
  (c.log = c.log || []).push({ t: c.end, k: 'close', text, by: U ? U.name : '' });
}
async function uploadSound(input, kind) { // zvuk se uloží na server, slyší ho všichni uživatelé
  const f = input.files[0], id = +input.dataset.id;
  input.value = '';
  if (!/\.(mp3|ogg|oga|wav|m4a|aac|webm|mp4)$/i.test(f.name)) return alert('Vyberte zvukový soubor (mp3, ogg, wav, m4a, aac).');
  if (f.size > 8e6) return alert('Zvuk může mít nejvýše 8 MB.');
  const t = kind === 'pre' ? S.types.find(x => x.id === id) : null;
  if (kind === 'pre' && !t) return;
  const old = kind === 'gong' ? S.settings.gong : t.pre;
  const data = await new Promise(r => { const x = new FileReader(); x.onload = () => r(String(x.result).replace(/^data:[^,]*,/, '')); x.readAsDataURL(f); });
  const { ok, j } = await api('sound', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: f.name, data, slot: kind === 'gong' ? 'gong' : 'pre-' + id, old: String(old || '').startsWith('media/sounds/') ? old : '' }) });
  if (!ok) return alert(j.error === 'not_writable' ? `Server nemůže zapisovat do složky ${j.dir}. Nastavte jí přes FTP práva 755 (nebo 775).`
    : j.error === 'too_large' ? 'Zvuk je příliš velký (max. 8 MB).'
    : j.error === 'forbidden' ? 'Zvuky může nahrávat jen administrátor.' : `Nahrání se nezdařilo (${j.error || 'chyba'}).`);
  if (kind === 'gong') S.settings.gong = j.url; else S.types.find(x => x.id === id).pre = j.url;
  save();
}
function setSt(id, v) {
  const x = S.vehicles.find(q => q.id === id); if (!x || x.st === v) return;
  x.st = v; x.stt = Date.now();
  S.calls.filter(c => !c.closed && c.status !== 'pending' && c.units.includes(id)).forEach(c => {
    (c.log = c.log || []).push({ t: x.stt, k: 'status', text: `${x.name} – ${ST[v]}`, by: U ? U.name : '' });
    if (v !== 0) c.moved = true; // od této chvíle se smí událost sama archivovat
  });
  // událost se sama archivuje, až když se všechny jednotky, které vyjely, vrátí na stanici
  S.calls.filter(c => !c.closed && c.status !== 'pending' && c.moved && c.units.every(u => { const w = S.vehicles.find(q => q.id === u); return !w || w.st === 0; }))
    .forEach(c => closeCall(c, 'Automaticky archivováno – všechny jednotky jsou ve stanici'));
  save();
}

function assign(pid, vid) { const p = S.people.find(x => x.id === pid); if (p) { p.vid = vid; save(); } }

/* ===== Povolání ZÚ / JSDH: vozidla jen z příslušné sekce + embed do Discordu ===== */
const bk = $('#backup');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const EMB = { zu: 0xE0453A, jsdh: 0xF2B134, tm: 0x4A90D9, zpp: 0x3FB27F };
const vinfo = v => ({ name: v.name, call: v.call, type: v.type, sub: v.sub });
function openBackup(no, k) {
  const c = S.calls.find(x => x.no === no); if (!c || c.closed || bk.open) return;
  if (c.status === 'pending') return alert('Nejdřív vyhlaste poplach, potom můžete povolat další jednotky.');
  if (!(ENV.backup || {})[k]) return alert(`Webhook pro ${CALLIN[k]} není nastaven v souboru .env na serveru (WEBHOOK_${k.toUpperCase()} nebo WEBHOOK_DEFAULT).`);
  const groups = bySec(S.vehicles.filter(v => canCall(v, k) && !c.units.includes(v.id)));
  bk.innerHTML = `<h2>Povolat ${CALLIN[k]} · #${esc(c.no)}</h2><p class="muted">${esc(tl(c))} – ${esc(c.addr)}</p>
  <form id="bkf" data-no="${esc(c.no)}" data-k="${k}">
    ${groups.length ? groups.map(([s, vs]) => secBox(s, `<div class="wrap"><table class="ct"><tr><th></th><th>Volačka</th><th>Název</th><th>Typ</th><th>Podtext</th><th>Stav</th></tr>${vs.map(v => `<tr><td><input type="checkbox" name="u" value="${v.id}" aria-label="Vybrat ${esc(v.name)}"></td><td><b>${esc(v.call)}</b></td><td>${esc(v.name)}</td><td>${esc(v.type)}</td><td>${esc(v.sub)}</td><td>${pill(v)}</td></tr>`).join('')}</table></div>`, vs.length)).join('')
      : `<p class="muted">Žádné vozidlo není označené jako <b>${CALLIN[k]}</b>. V Admin → Vozidla nastavte u vybraných vozidel „Povolávat jako“ na ${CALLIN[k]} – na sekci přitom nezáleží.</p>`}
    <label class="fl">Poznámka k povolání (volitelné)<textarea name="note" rows="2" maxlength="300"></textarea></label>
    <div class="btns"><button class="go" id="bkgo" ${groups.length ? '' : 'disabled'}>Povolat a odeslat na Discord</button><button type="button" class="link" data-bk="cancel">Zrušit</button></div></form>`;
  bk.showModal();
}
bk.onclick = e => { if (e.target.closest('[data-bk]')) bk.close(); };
bk.onchange = e => { if (e.target.name === 'u') updPick(bk); };
bk.onsubmit = e => { e.preventDefault(); sendBackup(e.target.dataset.no, e.target.dataset.k, new FormData(e.target)); };
async function sendBackup(no, k, d) {
  const c0 = S.calls.find(x => x.no === no); if (!c0) return;
  const ids = d.getAll('u').map(Number).filter(id => { // jen vozidla označená pro tento druh posily
    const v = S.vehicles.find(x => x.id === id);
    return v && canCall(v, k) && !c0.units.includes(id);
  });
  if (!ids.length) return alert(`Vyberte alespoň jedno vozidlo označené jako ${CALLIN[k]}.`);
  const note = d.get('note').trim(), vs = ids.map(id => S.vehicles.find(x => x.id === id)), btn = $('#bkgo'); btn.disabled = true;
  const embed = {
    title: `🚒 Povolání: ${CALLIN[k]}`, color: EMB[k] || 0x4A90D9, timestamp: new Date().toISOString(), footer: { text: `Dispečer: ${U.name}` },
    fields: [
      { name: 'Událost', value: clip(`#${c0.no} · ${tl(c0)}`, 1000), inline: true },
      { name: 'Priorita', value: String(c0.prio || 1), inline: true },
      { name: 'Adresa', value: clip([c0.addr, [c0.postal, c0.town].filter(Boolean).join(' ')].filter(Boolean).join(', '), 1000) },
      ...(c0.note ? [{ name: 'Popis události', value: clip(c0.note, 1000) }] : []),
      { name: `Povolané jednotky – ${CALLIN[k]}`, value: clip(vs.map(v => `• **${v.call || '—'}** · ${v.name}${v.sub ? ' (' + v.sub + ')' : ''}`).join('\n'), 1000) },
      { name: 'Jednotky již na události', value: clip(c0.unitNames.join(', ') || '—', 1000) },
      ...(note ? [{ name: 'Poznámka dispečera', value: clip(note, 1000) }] : [])
    ]
  };
  let r, j = {};
  try {
    r = await fetch('api.php?r=backup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: k, session: U.session || '', text: `Povolání: ${CALLIN[k]} – #${c0.no} ${tl(c0)}, ${c0.addr}`, embed }) }); // webhook a ping role doplní server z .env
    try { j = await r.json(); } catch { }
  } catch { btn.disabled = false; return alert('Server není dostupný, zpráva nebyla odeslána.'); }
  if (!r.ok) {
    btn.disabled = false;
    return alert(r.status === 401 ? 'Přihlášení na serveru vypršelo. Odhlaste se a přihlaste se znovu.' : `Zprávu se nepodařilo odeslat (${j.error || r.status}). Zkontrolujte webhook v souboru .env.`);
  }
  const c = S.calls.find(x => x.no === no); bk.close(); if (!c) return;
  const now = Date.now(), add = ids.map(id => S.vehicles.find(x => x.id === id)).filter(Boolean);
  c.unitInfo = c.unitInfo || c.unitNames.map(name => ({ name }));
  (c.called = c.called || []).push({ k, t: now });
  (c.log = c.log || []).push({ t: now, k: 'callin', text: `Povolán ${CALLIN[k]}: ${add.map(v => v.name).join(', ')}${note ? ' – ' + note : ''}`, by: U.name });
  add.forEach(v => { c.units.push(v.id); c.unitNames.push(v.name); c.unitInfo.push(vinfo(v)); }); // stav si jednotka nastaví sama
  pushAlarm(c, add.map(v => v.id)); // poplach dostanou jen nově povolané jednotky
  save();
}

view.onclick = e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset, id = +d.id;
  switch (d.act) {
    case 'st': setSt(id, +d.v); break;
    case 'at': at = d.v; render(); enter(); break;
    case 'edit': ed[d.k] = id; render(); break;
    case 'cancel': ed[d.k] = 0; render(); break;
    case 'del':
      if (confirm('Opravdu smazat tuto položku?')) { S[d.k] = S[d.k].filter(x => x.id !== id); if (d.k === 'vehicles') S.people.forEach(p => { if (p.vid === id) p.vid = 0; }); if (d.k === 'sections') S.vehicles.forEach(v => { if (v.sec === id) v.sec = 0; }); if (ed[d.k] === id) ed[d.k] = 0; save(); }
      break;
    case 'close': { const c = S.calls.find(x => x.no === d.no); if (c) { closeCall(c, 'Událost ukončena dispečerem'); save(); } break; }
    case 'realarm': { const c = S.calls.find(x => x.no === d.no); if (c) { (c.log = c.log || []).push({ t: Date.now(), k: 'alarm', text: 'Poplach opakován', by: U.name }); pushAlarm(c, c.units); save(); } break; }
    case 'copy': navigator.clipboard.writeText(d.t).then(() => alert('Zkopírováno.'), () => { }); break;
    case 'detail': showDetail(d.no); break;
    case 'newcall': openNewCall(); break;
    case 'editcall': openEdit(d.no); break;
    case 'launch': { const c = S.calls.find(x => x.no === d.no); if (c && c.status === 'pending') launch(c, true); break; }
    case 'opencall': mycall = d.no; ctab = 'notes'; render(); enter(); break;
    case 'closecall': mycall = null; render(); break;
    case 'ctab': ctab = d.v; render(); break;
    case 'unassign': assign(id, 0); break;
    case 'callin': openBackup(d.no, d.k); break;
    case 'tpre': play(S.types.find(x => x.id === id).pre); break;
    case 'rmpre': S.types.find(x => x.id === id).pre = null; save(); break;
    case 'tsay': { const x = S.pron.find(q => q.id === id); if (x) say(`${x.from}. Zkouška: vyjíždí ${x.from}.`); break; }
    case 'diag': testWrite(); break;
    case 'tgong': (S.settings.gong ? play(S.settings.gong) : synth()); break;
    case 'rmgong': S.settings.gong = null; save(); break;
    case 'ttts': say('Pozor, výjezd. Požár. Hlavní třída 12, Brno. Vyjíždí: CAS 20 Praha 1.'); break;
  }
};

view.onchange = async e => {
  const t = e.target, a = t.dataset.act;
  if (a === 'addcrew') { if (t.value) assign(+t.value, +t.dataset.vid); }
  else if (a === 'setveh') { if (+t.value) assign(+t.dataset.pid, +t.value); }
  else if (a === 'stv') setSt(+t.dataset.id, +t.value);
  else if ((a === 'gong' || a === 'pre') && t.files[0]) await uploadSound(t, a);
};

view.onsubmit = e => {
  e.preventDefault();
  const f = e.target, d = new FormData(f), s = S.settings;
  switch (f.dataset.act) {
    case 'note': {
      const c = S.calls.find(x => x.no === f.dataset.no), t = d.get('text').trim();
      if (!c || c.closed || !t) return;
      (c.log = c.log || []).push({ t: Date.now(), k: 'note', text: t, by: U.name, veh: vname(getVeh()) });
      save();
      break;
    }
    case 'crud': {
      const k = f.dataset.k, o = {};
      FIELDS[k].forEach(([n]) => { o[n] = d.get(n).trim(); });
      if (!o[FIELDS[k][0][0]]) return;
      if (k === 'vehicles') o.sec = +o.sec || 0;
      if (k === 'types') o.subs = [...new Set(String(o.subs || '').split(',').map(x => x.trim()).filter(Boolean))];
      if (ed[k]) { Object.assign(S[k].find(x => x.id === ed[k]), o); ed[k] = 0; }
      else S[k].push({ id: Date.now(), ...o, ...(k === 'vehicles' ? { st: 0 } : {}), ...(k === 'types' ? { pre: null } : {}) });
      save();
      break;
    }
    case 'srv':
      s.name = d.get('name').trim() || s.name; s.vol = +d.get('vol'); s.rate = +d.get('rate'); s.tts = d.has('tts'); s.voice = (d.get('voice') || '').trim(); s.terms = d.get('terms').trim() || DEFAULT_TERMS; s.video = d.get('video').trim(); save(); break;
  }
};

document.addEventListener('toggle', e => {
  const d = e.target;
  if (d && d.dataset && d.dataset.sec) secOpen[d.dataset.sec] = d.open;
}, true);

view.onkeydown = e => {
  if (e.key !== 'Enter') return; const a = e.target.dataset.act;
  if (a === 'detail') showDetail(e.target.dataset.no); else if (a === 'opencall') { mycall = e.target.dataset.no; ctab = 'notes'; render(); }
};
view.oninput = e => {
  const t = e.target; if (t.type !== 'range') return;
  t.closest('label').querySelector('output').textContent = t.name === 'vol' ? Math.round(t.value * 100) + ' %' : '×' + t.value;
};

/* ===== Podmínky a cookies ===== */
const legalHtml = () => `<h2>Podmínky používání</h2>${S.settings.terms.split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}
  <h2>Cookies a úložiště</h2><p>Aplikace nepoužívá sledovací ani reklamní cookies. Všechna data (nastavení, zvuky, jednotky, osoby i události) jsou uložená na serveru a jsou společná pro všechny uživatele. V prohlížeči se ukládá jedině přihlašovací cookie, aby systém věděl, kdo jste; odhlášením se smaže.</p>
  <p>Při přihlášení přes Discord se uplatňují i zásady a cookies společnosti Discord.</p>`;
function showLegal() {
  const d = $('#legal'); if (d.open) return;
  d.innerHTML = legalHtml() + '<div class="btns"><button type="button" class="primary" data-x="close">Zavřít</button><button type="button" data-x="revoke">Odvolat souhlas a odhlásit</button></div>';
  d.showModal();
}
$('#legal').onclick = async e => {
  const b = e.target.closest('[data-x]'); if (!b) return;
  if (b.dataset.x === 'close') return $('#legal').close();
  memConsent = false; try { await api('logout', { method: 'POST' }); } catch { } location.reload();
};
document.addEventListener('click', e => { if (e.target.closest('[data-legal]')) showLegal(); });

/* povinný souhlas při první návštěvě (nebo po smazání dat prohlížeče) */
const gate = $('#gate');
function showGate() {
  if (gate.open) return;
  gate.innerHTML = `<h2>Než budete pokračovat</h2><p class="muted">Pro vstup je nutné souhlasit s podmínkami. Data systému jsou na serveru, v prohlížeči zůstává jen přihlašovací cookie.</p>
    <div class="gscroll">${legalHtml()}</div>
    <label class="chk"><input type="checkbox" id="g1"><span>Souhlasím s podmínkami používání</span></label>
    <label class="chk"><input type="checkbox" id="g2"><span>Souhlasím s použitím přihlašovací cookie</span></label>
    <button class="primary" id="gok" disabled>Souhlasím a pokračuji</button>`;
  gate.showModal();
}
gate.addEventListener('cancel', e => e.preventDefault());
gate.addEventListener('close', () => { if (!consentOk()) setTimeout(showGate); });
gate.onchange = () => { $('#gok').disabled = !($('#g1').checked && $('#g2').checked); };
gate.onclick = e => {
  if (e.target.id !== 'gok' || $('#gok').disabled) return;
  memConsent = true;
  gate.close();
};
/* ===== Nový výjezd (okno) a karta události ===== */
let draft = [];
const nc = $('#newcall');
const noteItem = x => `<div class="ev"><span class="evd"></span><div><time>${ts(x.t)}</time> <span class="tag g">${esc(x.k === 'note' ? (x.veh || x.by || '') : 'CAD')}</span><div>${esc(x.text)}</div></div></div>`;
const renderDraft = () => { $('#ncn').innerHTML = draft.length ? draft.map(noteItem).join('') : '<div class="cempty">Zatím žádné poznámky</div>'; };
const secBox = (s, inner, n, key) => `<details class="secbox" ${key ? `data-sec="${esc(key + s.id)}" ${secOpen[key + s.id] ? 'open' : ''}` : ''}><summary>${esc(s.name)} <span class="cb">${n}</span><b class="selc"></b></summary><div class="secin">${inner}</div></details>`;
function updPick(root) { // u každé sekce ukáže, kolik vozidel je vybráno
  root.querySelectorAll('details.secbox').forEach(d => {
    const n = d.querySelectorAll('input[name="u"]:checked').length;
    d.classList.toggle('has', n > 0);
    const b = d.querySelector('.selc'); if (b) b.textContent = n ? `vybráno ${n}` : '';
  });
}
const pick = v => `<label class="chip pick"><input type="checkbox" name="u" value="${v.id}"><b>${esc(v.call || '—')}</b><span>${esc(v.name)}</span>${v.type ? `<small>${esc(v.type)}</small>` : ''}<span class="pill p${v.st}">${ST[v.st]}</span></label>`;

function openNewCall() {
  if (nc.open) return; draft = []; preKey = ''; clearTimeout(preTimer);
  const id = new Date().getFullYear() + '-' + String(S.seq).padStart(4, '0');
  nc.innerHTML = `<div class="mbar"><b>Nový výjezd</b><button type="button" data-nc="cancel" aria-label="Zavřít">&#215;</button></div>
  <form id="ncf" class="mbody"><div class="mhead"><h2>DISPEČINK <u>#${id}</u></h2><span class="tag g" id="nct">Probíhá</span><span class="tag b" id="ncp">Priorita 1</span></div>
  <div class="mgrid"><div class="mleft"><div class="two">
    <section class="mc"><h3>Původ hovoru</h3><div class="mb"><label>Původ hovoru<select name="origin">${ORIGINS.map(o => `<option>${o}</option>`).join('')}</select></label></div></section>
    <section class="mc"><h3>Stav události</h3><div class="mb two"><label>Stav události<select name="status"><option value="active">Probíhá – vyhlásit poplach</option><option value="pending">Čeká – uložit bez poplachu</option></select></label><label>Priorita<select name="prio">${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}</select></label></div></section>
    <section class="mc"><h3>Místo</h3><div class="mb two"><label>PSČ<input name="postal" maxlength="10" inputmode="numeric"></label><label>Obec / čtvrť<input name="town" maxlength="60"></label><label class="wide">Adresa<input name="addr" required maxlength="120" placeholder="Ulice, číslo popisné"></label></div></section>
    <section class="mc"><h3>Detaily události</h3><div class="mb two"><label>Typ události<select name="type">${S.types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><label>Podtyp<select name="sub">${subOpts((S.types[0] || {}).id)}</select></label><label class="wide">Název výjezdu<input name="title" maxlength="80"></label></div>
</section>
  </div>
  <section class="mc"><h3>Jednotky k výjezdu</h3><div class="mb">${bySec(S.vehicles).map(([s, vs]) => secBox(s, vs.map(pick).join(''), vs.length, 'nc')).join('') || '<span class="muted">Žádná vozidla – přidejte je v Admin.</span>'}</div></section>
  <section class="mc"><h3>Popis události</h3><div class="mb"><label>Popis události<textarea name="note" rows="4" maxlength="300"></textarea></label></div></section></div>
  <aside class="mc side"><div class="mtabs"><span class="on">Poznámky</span></div><div id="ncn" class="nlist"></div>
    <div class="mb"><label>Poznámka<textarea id="ncnote" rows="3" maxlength="300"></textarea></label><div class="btns"><button type="button" class="go" data-nc="addnote">+ Přidat poznámku</button></div></div></aside></div>
  <div class="mfoot"><button type="button" class="link" data-nc="cancel">Zrušit</button><button class="go">+ Vytvořit výjezd</button></div></form>`;
  renderDraft(); nc.showModal();
}
nc.onclick = e => {
  const b = e.target.closest('[data-nc]'); if (!b) return;
  if (b.dataset.nc === 'cancel') return nc.close();
  const t = $('#ncnote'), v = t.value.trim();
  if (v) { draft.push({ t: Date.now(), k: 'note', text: v, by: U.name, veh: 'Dispečink' }); t.value = ''; renderDraft(); }
};
function sendPre() { // odešle se, až je vybraný typ i alespoň jedna jednotka
  if (!nc.open) return;
  const f = $('#ncf'); if (!f) return;
  const d = new FormData(f);
  const units = d.getAll('u').map(Number).filter(Boolean);
  const type = +d.get('type') || 0;
  if (!units.length || !type) return;
  const key = type + ':' + units.slice().sort((a, b) => a - b).join(',');
  if (key === preKey) return; // stejná kombinace se neposílá znovu
  preKey = key;
  clearTimeout(preTimer);
  preTimer = setTimeout(() => {
    api('prealert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, units }) }).catch(() => { });
  }, 600); // chvilka na doklikání dalších jednotek
}
nc.onchange = e => {
  if (e.target.name === 'status') $('#nct').textContent = e.target.value === 'pending' ? 'Čeká' : 'Probíhá';
  if (e.target.name === 'prio') $('#ncp').textContent = 'Priorita ' + e.target.value;
  if (e.target.name === 'type') nc.querySelector('[name=sub]').innerHTML = subOpts(+e.target.value);
  if (e.target.name === 'u') updPick(nc);
  if (e.target.name === 'u' || e.target.name === 'type') sendPre();
};
nc.onsubmit = e => { e.preventDefault(); createCall(new FormData(e.target)); };

function launch(c, announce) { // rozeslání poplachu jednotkám
  const now = Date.now(); c.status = 'active';
  if (announce) c.log.push({ t: now, k: 'alarm', text: 'Poplach vyhlášen', by: U.name });
  pushAlarm(c, c.units);
  save();
}
function createCall(d) {
  const tp = S.types.find(x => x.id === +d.get('type')), u = d.getAll('u').map(Number), addr = d.get('addr').trim();
  if (!tp || !addr || !u.length) return alert('Vyberte typ události, zadejte adresu a vyberte alespoň jednu jednotku.');
  const pending = d.get('status') === 'pending', now = Date.now();
  const c = {
    no: new Date().getFullYear() + '-' + String(S.seq++).padStart(4, '0'), type: tp.id, typeName: tp.name, sub: (tp.subs || []).includes(d.get('sub')) ? d.get('sub') : '',
    title: d.get('title').trim(), origin: d.get('origin'), prio: +d.get('prio') || 1, status: pending ? 'pending' : 'active',
    postal: d.get('postal').trim(), town: d.get('town').trim(), addr, note: d.get('note').trim(),
    units: u, unitNames: u.map(vname),
    unitInfo: u.map(id => { const v = S.vehicles.find(x => x.id === id) || {}; return { name: v.name, call: v.call, type: v.type, sub: v.sub }; }),
    t: now, closed: false, end: null, by: U.name,
    log: [{ t: now, k: 'create', text: pending ? 'Událost vytvořena, čeká na výjezd' : 'Událost vytvořena, poplach vyhlášen', by: U.name }, ...draft]
  };
  S.calls.push(c); S.calls = S.calls.slice(-500);
  nc.close();
  if (pending) save(); else launch(c, false);
}

const fv = (l, v) => `<div class="fv"><small>${l}</small><b>${v ? esc(v) : '—'}</b></div>`;
const card = (t, body) => `<section class="mc"><h3>${t}</h3><div class="mb">${body}</div></section>`;
function myCall(no, cmd) { // karta události ("Moje událost")
  const c = S.calls.find(x => x.no === no), vid = getVeh();
  if (!c || c.closed || c.status === 'pending' || !c.units.includes(vid)) { mycall = null; return ''; }
  const items = (c.log || []).slice().sort((a, b) => a.t - b.t).filter(x => ctab !== 'states' || x.k === 'status').map(noteItem).join('') || '<div class="cempty">Zatím nic</div>';
  return `<div class="cbar"><button class="back" data-act="closecall" aria-label="Zpět">&#8592;</button><b>Moje událost</b></div>
  <div class="chd"><h2>Výjezd <u>#${esc(c.no)}</u></h2><span class="tag g">Probíhá</span><span class="tag b">Priorita ${esc(c.prio || 1)}</span></div>
  <div class="cl"><div class="mleft"><div class="two">
    ${card('Původ hovoru', fv('Původ hovoru', c.origin))}
    ${card('Stav události', `<div class="two">${fv('Stav události', 'Probíhá')}${fv('Priorita', c.prio || 1)}</div>`)}
    ${card('Místo', `<div class="two">${fv('PSČ', c.postal)}${fv('Obec / čtvrť', c.town)}</div>${fv('Adresa', c.addr)}`)}
    ${card('Detaily události', `<div class="two">${fv('Typ události', c.typeName)}${fv('Podtyp', c.sub)}${fv('Název výjezdu', c.title || tl(c))}</div><small class="lbl">Jednotky</small>${chips(c)}`)}
  </div>
  ${cmd ? card('Odeslat stav jednotky', `<div class="btns">${ST.map((n, i) => { const v = S.vehicles.find(x => x.id === vid) || {}; return `<button data-act="st" data-id="${vid}" data-v="${i}" class="${i === v.st ? 'on' : ''}">${n}</button>`; }).join('')}</div>`) : ''}
  ${card('Popis události', fv('Popis události', c.note))}</div>
  <aside class="mc side"><div class="mtabs"><button data-act="ctab" data-v="notes" class="${ctab === 'notes' ? 'on' : ''}">Poznámky</button><button data-act="ctab" data-v="states" class="${ctab === 'states' ? 'on' : ''}">Stavy</button></div>
    <div class="nlist">${items}</div>
    ${cmd ? `<form data-act="note" data-no="${esc(c.no)}" class="mb"><textarea name="text" rows="3" required maxlength="300" placeholder="Zpráva dispečerovi…" aria-label="Zpráva pro dispečera"></textarea><div class="btns"><button class="go">+ Odeslat dispečerovi</button></div></form>` : ''}</aside></div>`;
}

async function testWrite() { // ověří, že server opravdu přijme a uloží změnu
  const mark = 'test-' + Date.now();
  const { ok, status, j } = await api('state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patch: { settings: { ...S.settings, diag: mark } } }) });
  if (!ok) return alert(`Server změnu NEPŘIJAL.\nKód: ${status}\nChyba: ${j.error || '—'}${j.dir ? '\nSložka: ' + j.dir : ''}${j.key ? '\nKlíč: ' + j.key : ''}\n\nPošlete tento text, podle něj se chyba opraví.`);
  const { j: back } = await api('state');
  const saved = back.state && back.state.settings && back.state.settings.diag === mark;
  alert(saved ? 'Zápis na server funguje (změna se uložila i načetla zpět).' : 'Server zápis potvrdil, ale data se nenačetla zpět – složka cad-data zřejmě není zapisovatelná.');
  await sync();
}

/* ===== Úprava události (typ, podtyp, název, priorita, adresa, popis) ===== */
const subOpts = (id, cur = '') => {
  const subs = ((S.types.find(t => t.id === id) || {}).subs || []).slice();
  if (cur && !subs.includes(cur)) subs.push(cur);
  return '<option value="">— bez podtypu —</option>' + subs.map(s => `<option ${s === cur ? 'selected' : ''}>${esc(s)}</option>`).join('');
};
const ec = $('#editcall');
function openEdit(no) {
  const c = S.calls.find(x => x.no === no); if (!c || c.closed || ec.open) return;
  const known = S.types.some(t => t.id === c.type);
  ec.innerHTML = `<h2>Upravit událost #${esc(c.no)}</h2>
  <form id="ecf" class="grid" data-no="${esc(c.no)}">
    <label>Typ události<select name="type">${known ? '' : `<option value="${c.type}" selected>${esc(c.typeName)}</option>`}${S.types.map(t => `<option value="${t.id}" ${t.id === c.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label>Podtyp<select name="sub">${subOpts(c.type, c.sub)}</select></label>
    <label class="wide">Název výjezdu<input name="title" value="${esc(c.title)}" maxlength="80"></label>
    <label>Priorita<select name="prio">${[1, 2, 3, 4, 5].map(n => `<option ${n === (c.prio || 1) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Adresa<input name="addr" required value="${esc(c.addr)}" maxlength="120"></label>
    <label class="wide">Popis události<textarea name="note" rows="3" maxlength="300">${esc(c.note)}</textarea></label>
    <div class="wide"><small class="lbl">Připojit další jednotky <span class="muted">(jen se přidají k události – neodesílá se nic na Discord ani poplach)</span></small>
      ${bySec(S.vehicles.filter(v => !c.units.includes(v.id))).map(([s, vs]) => secBox(s, vs.map(pick).join(''), vs.length, 'ed')).join('') || '<span class="muted">Všechna vozidla už na události jsou.</span>'}</div>
    <div class="btns"><button class="go">Uložit změny</button><button type="button" class="link" data-ec="cancel">Zrušit</button></div></form>`;
  ec.showModal();
}
ec.onclick = e => { if (e.target.closest('[data-ec]')) ec.close(); };
ec.onchange = e => {
  if (e.target.name === 'type') ec.querySelector('[name=sub]').innerHTML = subOpts(+e.target.value);
  if (e.target.name === 'u') updPick(ec);
};
ec.onsubmit = e => { e.preventDefault(); saveEdit(e.target.dataset.no, new FormData(e.target)); };
function saveEdit(no, d) {
  const c = S.calls.find(x => x.no === no); ec.close(); if (!c) return;
  const tp = S.types.find(x => x.id === +d.get('type')), ch = [];
  if (tp && tp.id !== c.type) { ch.push(`typ: ${c.typeName} → ${tp.name}`); c.type = tp.id; c.typeName = tp.name; }
  const set = (k, label, v) => { if ((c[k] || '') !== v) { ch.push(`${label}: ${c[k] || '—'} → ${v || '—'}`); c[k] = v; } };
  set('sub', 'podtyp', d.get('sub') || ''); set('title', 'název', d.get('title').trim());
  set('addr', 'adresa', d.get('addr').trim() || c.addr); set('note', 'popis', d.get('note').trim());
  const pr = +d.get('prio') || 1; if (pr !== (c.prio || 1)) { ch.push(`priorita: ${c.prio || 1} → ${pr}`); c.prio = pr; }
  const add = d.getAll('u').map(Number).filter(id => id && !c.units.includes(id)).map(id => S.vehicles.find(v => v.id === id)).filter(Boolean);
  if (add.length) { // jen připojení k události, bez poplachu a bez Discordu
    c.unitInfo = c.unitInfo || c.unitNames.map(name => ({ name }));
    add.forEach(v => { c.units.push(v.id); c.unitNames.push(v.name); c.unitInfo.push(vinfo(v)); });
    ch.push('připojeny jednotky: ' + add.map(v => v.call || v.name).join(', '));
  }
  if (ch.length) { (c.log = c.log || []).push({ t: Date.now(), k: 'edit', text: 'Událost upravena – ' + ch.join('; '), by: U.name }); save(); }
}

/* ===== Přítomnost (online tečka) ===== */
async function beat() { if (U) { try { await api('ping', { method: 'POST' }); } catch { } } }
setInterval(beat, 40000);

function voiceTip() { // každý uživatel si hlas instaluje na svém počítači
  if (tipShown || !U || !voicesDone || !S.settings.tts) return;
  if (voices.some(isCzech)) return;
  tipShown = true;
  const el = document.createElement('div');
  el.className = 'warn'; el.id = 'voicetip';
  el.innerHTML = `<div class="tiprow"><b>Chybí český hlas.</b> <span class="muted">Hlášení bude znít cizím přízvukem.</span>`
    + '<button type="button" id="tipx">Rozumím</button></div>'
    + `<details><summary>Jak hlas nainstalovat</summary><pre>${esc(osHelp())}</pre></details>`;
  const m = document.querySelector('main') || document.body;
  m.parentNode.insertBefore(el, m);
  const b = document.getElementById('tipx'); if (b) b.onclick = () => el.remove();
}

/* ===== Video v rohu (jen dispečink) ===== */
const vid = { box: $('#vid'), wrap: $('#vidw'), v: $('#vidv'), b: $('#vidt'), err: $('#viderr') };
let videoShown = true; // volba platí jen pro toto otevření stránky
const videoOn = () => videoShown;
function updateVideo() {
  const show = !!U && tab === 'dispatch' && canTab('dispatch'), on = show && videoOn();
  vid.box.hidden = !show; vid.wrap.hidden = !on;
  vid.b.textContent = videoOn() ? 'Skrýt video' : 'Zobrazit video'; vid.b.setAttribute('aria-pressed', String(videoOn()));
  if (!on) { vid.v.pause(); return; }
  const src = (S.settings.video || '').trim();
  if (!src) { vid.err.hidden = false; vid.err.textContent = 'Video není nastaveno (Admin → Server).'; return; }
  if (vid.v.getAttribute('src') !== src) { vid.err.hidden = true; vid.v.src = src; }
  const p = vid.v.play(); if (p && p.catch) p.catch(() => { });
}
vid.b.onclick = () => { videoShown = !videoShown; updateVideo(); };
vid.v.onerror = () => { vid.err.hidden = false; vid.err.textContent = 'Video nenalezeno: ' + (S.settings.video || '—'); };
vid.v.onloadeddata = () => { vid.err.hidden = true; };

/* ===== Start ===== */
document.addEventListener('click', () => { try { AC().resume(); } catch { } $('#snd').hidden = true; }, { once: true });
$('#snd').onclick = () => { };
$('#demo').hidden = true;
try { ['cad.state', 'cad.user', 'cad.consent', 'cad.tos', 'cad.veh', 'cad.video'].forEach(k => localStorage.removeItem(k)); } catch { } // zbytky po starších verzích
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('cs-CZ'); }, 1000);
if ('speechSynthesis' in window) loadVoices().then(() => { voiceTip(); if (U && tab === 'admin') render(true); }); // hlasy načíst hned, ať jdou vybrat v nastavení
setInterval(sync, 3000); // průběžně stahuje společná data ze serveru

(async () => {
  await loadEnv();
  try { const { j } = await api('me'); if (j && j.user) U = j.user; } catch { }
  if (U) { await sync(); start(); }
  else { err(sessionStorage['cad.err'] || ''); sessionStorage.removeItem('cad.err'); if (!consentOk()) showGate(); }
})();
