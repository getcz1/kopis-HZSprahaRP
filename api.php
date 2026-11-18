<?php
/* CAD – API v PHP (pro běžný FTP webhosting s PHP 7.2+; Node.js není potřeba).
   - Nastavení čte ze souboru cad.env, který patří MIMO veřejnou složku (viz README).
   - Ověřuje přihlášení přes Discord (role z cad.env) a odesílá webhooky.
   - Webhooky, ping role ani tajný klíč se NIKDY neposílají do prohlížeče. */
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const KINDS = ['zu', 'jsdh', 'tm', 'zpp'];
const JF = JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE;

function out($status, $data) { http_response_code($status); echo json_encode($data, JF); exit; }
function s($v) { return is_scalar($v) ? (string)$v : ''; }
function cut($v, $n) {
  $v = s($v);
  if (function_exists('mb_substr')) return mb_substr($v, 0, $n, 'UTF-8');
  $c = preg_split('//u', $v, -1, PREG_SPLIT_NO_EMPTY);
  return $c ? implode('', array_slice($c, 0, $n)) : '';
}
function lower($v) { return function_exists('mb_strtolower') ? mb_strtolower($v, 'UTF-8') : strtolower($v); }

/* ---------- soubor s nastavením ---------- */
function parse_env($txt) {
  $o = [];
  foreach (preg_split('/\r?\n/', $txt) as $raw) {
    $line = trim($raw);
    if ($line === '' || $line[0] === '#') continue;
    $i = strpos($line, '=');
    if ($i === false || $i < 1) continue;
    $k = trim(substr($line, 0, $i)); $v = trim(substr($line, $i + 1));
    if (strlen($v) >= 2 && (($v[0] === '"' && substr($v, -1) === '"') || ($v[0] === "'" && substr($v, -1) === "'"))) $v = substr($v, 1, -1);
    else $v = preg_replace('/\s+#.*$/', '', $v);
    $o[$k] = $v;
  }
  return $o;
}
function find_env() { // nejdřív mimo veřejnou složku; cad.env.php je bezpečný i uvnitř (PHP ho nevypíše)
  $dirs = [__DIR__]; // nejdřív složka aplikace (webFTP nad ni nevidí); cad.env.php je chráněný PHP závorkou
  foreach ([1, 2, 3] as $n) $dirs[] = dirname(__DIR__, $n); // pak nad ní, pokud tam soubor někdo dá
  $c = [];
  $x = getenv('CAD_ENV_FILE'); if ($x) $c[] = $x;
  foreach ($dirs as $d) { $c[] = $d . '/cad.env.php'; $c[] = $d . '/cad.env'; }
  $c[] = __DIR__ . '/.env';
  foreach ($c as $f) if (@is_file($f) && @is_readable($f)) return $f;
  return null;
}
function guarded($f) { // soubor .php, který se při otevření v prohlížeči sám ukončí a nic nevypíše
  return substr($f, -4) === '.php' && preg_match('/^\s*<\?php.{0,200}?(exit|die)\s*[;(]/is', (string)@file_get_contents($f, false, null, 0, 300));
}
function inside_web($f) {
  $real = realpath($f); if (!$real) return false;
  if (dirname($real) === realpath(__DIR__)) return true;
  $root = isset($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : false;
  return $root && strpos($real, $root . DIRECTORY_SEPARATOR) === 0;
}
$ENVFILE = find_env();
$FILEENV = $ENVFILE ? parse_env((string)@file_get_contents($ENVFILE)) : [];
function E($k) { global $FILEENV; $v = getenv($k); if ($v === false || $v === '') $v = isset($FILEENV[$k]) ? $FILEENV[$k] : ''; return trim((string)$v); }
function is_url($v) { $p = parse_url($v); return $p && isset($p['scheme'], $p['host']) && in_array(strtolower($p['scheme']), ['http', 'https'], true); }
function is_id($v) { return (bool)preg_match('/^\d{17,20}$/', $v); }

$cfg = [
  'clientId' => E('DISCORD_CLIENT_ID'), 'guildId' => E('DISCORD_GUILD_ID'),
  'roles' => ['admin' => E('DISCORD_ROLE_ADMIN'), 'dispatch' => E('DISCORD_ROLE_DISPATCH'), 'fire' => E('DISCORD_ROLE_FIRE'), 'commander' => E('DISCORD_ROLE_COMMANDER')],
  'demo' => (bool)preg_match('/^(1|true|yes|on)$/i', E('ALLOW_DEMO')),
  'redirect' => is_url(E('REDIRECT_URL')) ? E('REDIRECT_URL') : '',
  'api' => rtrim(E('DISCORD_API') !== '' ? E('DISCORD_API') : 'https://discord.com/api', '/'),
];
$hooks = []; $pings = [];
foreach (KINDS as $k) {
  $K = strtoupper($k); $h = E('WEBHOOK_' . $K);
  if ($h === '' && ($k === 'tm' || $k === 'zpp')) $h = E('WEBHOOK_DENNI'); // TM i ZPP do jednoho kanálu
  if ($h === '') $h = E('WEBHOOK_DEFAULT');
  $p = E('PING_' . $K); // ping role zůstává pro každý druh vlastní
  if ($h !== '' && is_url($h)) $hooks[$k] = $h;
  if ($p !== '' && is_id($p)) $pings[$k] = $p;
}
$SECRET = E('SESSION_SECRET'); $SECRET_OK = strlen($SECRET) >= 16;

/* ---------- podepsaná relace ---------- */
function b64u($x) { return rtrim(strtr(base64_encode($x), '+/', '-_'), '='); }
function mac($body) { global $SECRET; return b64u(hash_hmac('sha256', $body, $SECRET, true)); }
function sign($p) { $body = b64u(json_encode($p, JF)); return $body . '.' . mac($body); }
const COOKIE = 'cad_sess';
function set_cookie($tok, $long) {
  $sec = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
  $exp = $long ? time() + 30 * 86400 : 0;
  $base = dirname($_SERVER['SCRIPT_NAME']); if ($base === '\\' || $base === '.') $base = '/';
  if (substr($base, -1) !== '/') $base .= '/';
  if (PHP_VERSION_ID >= 70300) setcookie(COOKIE, $tok, ['expires' => $exp, 'path' => $base, 'httponly' => true, 'samesite' => 'Lax', 'secure' => $sec]);
  else setcookie(COOKIE, $tok, $exp, $base . '; samesite=Lax', '', $sec, true);
}
function cur_session() { global $SECRET_OK; return $SECRET_OK && isset($_COOKIE[COOKIE]) ? verify((string)$_COOKIE[COOKIE]) : null; }
function need_session() { $s = cur_session(); if (!$s) out(401, ['error' => 'unauthorized']); return $s; }
function verify($tok) {
  $parts = explode('.', $tok);
  if (count($parts) !== 2 || !hash_equals(mac($parts[0]), $parts[1])) return null;
  $j = json_decode((string)base64_decode(strtr($parts[0], '-_', '+/'), true), true);
  return (is_array($j) && isset($j['exp'], $j['perms'], $j['id']) && is_array($j['perms']) && $j['exp'] > round(microtime(true) * 1000)) ? $j : null;
}

/* ---------- HTTP ---------- */
function http_request($method, $url, $headers = [], $body = null) {
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $res = curl_exec($ch); $st = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return $res === false ? [0, ''] : [$st, (string)$res];
  }
  $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body === null ? '' : $body, 'timeout' => 10, 'ignore_errors' => true]]);
  $res = @file_get_contents($url, false, $ctx); $st = 0;
  if (isset($http_response_header[0]) && preg_match('#HTTP/\S+\s+(\d{3})#', $http_response_header[0], $m)) $st = (int)$m[1];
  return $res === false ? [0, ''] : [$st, (string)$res];
}
function body() {
  $raw = file_get_contents('php://input', false, null, 0, 100001);
  if ($raw === false) $raw = '';
  if (strlen($raw) > 100000) out(413, ['error' => 'too_large']);
  if ($raw === '') return [];
  $j = json_decode($raw, true);
  if (!is_array($j)) out(400, ['error' => 'bad_json']);
  return $j;
}
function limited($id) { // max. 12 odeslání za minutu na uživatele
  $f = sys_get_temp_dir() . '/cad_rl_' . substr(hash('sha256', $id), 0, 32);
  $fh = @fopen($f, 'c+'); if (!$fh) return false;
  flock($fh, LOCK_EX);
  $now = time(); $a = [];
  foreach (explode(',', (string)stream_get_contents($fh)) as $t) if ((int)$t > $now - 60) $a[] = (int)$t;
  $a[] = $now; ftruncate($fh, 0); rewind($fh); fwrite($fh, implode(',', $a)); flock($fh, LOCK_UN); fclose($fh);
  return count($a) > 12;
}

/* ---------- koncové body ---------- */
function public_config() { // jen veřejné údaje a informace, co je nastaveno (žádné tajné hodnoty)
  global $cfg, $hooks, $pings, $SECRET_OK, $ENVFILE;
  $roles = []; foreach ($cfg['roles'] as $k => $v) $roles[$k] = $v !== '';
  $backup = []; $ping = []; foreach (KINDS as $k) { $backup[$k] = !empty($hooks[$k]); $ping[$k] = !empty($pings[$k]); }
  return ['clientId' => $cfg['clientId'], 'guildId' => $cfg['guildId'], 'redirect' => $cfg['redirect'], 'demo' => $cfg['demo'], 'roles' => $roles, 'backup' => $backup, 'ping' => $ping,
    'secret' => $SECRET_OK, 'envFound' => $ENVFILE !== null, 'envInside' => $ENVFILE ? (inside_web($ENVFILE) && !guarded($ENVFILE)) : false];
}
function do_session() {
  global $cfg, $SECRET_OK;
  $b = body();
  if (!$SECRET_OK) out(503, ['error' => 'no_secret']);
  if (!empty($b['demo'])) {
    if (!$cfg['demo']) out(403, ['error' => 'demo_disabled']);
    $name = trim(cut(isset($b['name']) ? $b['name'] : '', 40)); if ($name === '') $name = 'Demo';
    $role = (isset($b['role']) && in_array($b['role'], ['fire', 'commander', 'dispatch', 'admin'], true)) ? $b['role'] : 'fire';
    $user = ['id' => 'demo:' . lower($name), 'name' => $name, 'perms' => [$role]];
  } else {
    if ($cfg['guildId'] === '' || !array_filter($cfg['roles'])) out(503, ['error' => 'not_configured']);
    $tok = isset($b['token']) ? $b['token'] : null;
    if (!is_string($tok) || strlen($tok) < 10 || strlen($tok) > 300) out(400, ['error' => 'bad_request']);
    list($st, $res) = http_request('GET', $cfg['api'] . '/users/@me/guilds/' . rawurlencode($cfg['guildId']) . '/member', ['Authorization: Bearer ' . $tok, 'Accept: application/json', 'User-Agent: CAD (php)']);
    if ($st === 0) out(502, ['error' => 'discord_unreachable']);
    if ($st === 404) out(404, ['error' => 'not_member']);
    if ($st < 200 || $st >= 300) out(401, ['error' => 'discord_rejected', 'status' => $st]);
    $m = json_decode($res, true);
    if (!is_array($m) || !isset($m['user']['id'])) out(502, ['error' => 'discord_bad_response']);
    $roles = (isset($m['roles']) && is_array($m['roles'])) ? array_map('strval', $m['roles']) : [];
    $perms = [];
    foreach ($cfg['roles'] as $k => $id) if ($id !== '' && in_array($id, $roles, true)) $perms[] = $k;
    if (!$perms) out(403, ['error' => 'no_role', 'roleCount' => count($roles)]);
    $name = 'Uživatel';
    foreach ([isset($m['nick']) ? $m['nick'] : null, isset($m['user']['global_name']) ? $m['user']['global_name'] : null, isset($m['user']['username']) ? $m['user']['username'] : null] as $c) if (is_string($c) && $c !== '') { $name = $c; break; }
    $user = ['id' => s($m['user']['id']), 'name' => cut($name, 60), 'perms' => $perms];
  }
  register_person($user);
  $tok = sign($user + ['exp' => (int)round(microtime(true) * 1000) + 30 * 86400000]);
  set_cookie($tok, !empty($b['remember']));
  out(200, ['user' => $user]);
}
/* ---------- sdílený stav (společný pro všechny uživatele) ---------- */
const STATE_DIR = 'cad-data';
const SOUND_DIR = 'media/sounds';
const GUARD = "<?php exit; ?>\n";
function state_file() { return __DIR__ . '/' . STATE_DIR . '/state.php'; }
function state_read() {
  $raw = @file_get_contents(state_file());
  if ($raw === false) return null;
  $nl = strpos($raw, "\n");
  $j = json_decode($nl === false ? $raw : substr($raw, $nl + 1), true);
  return is_array($j) ? $j : null;
}
function ensure_dir($rel) {
  $d = __DIR__ . '/' . $rel;
  if (!is_dir($d)) @mkdir($d, 0775, true);
  if ($rel === STATE_DIR && is_dir($d) && !@is_file($d . '/.htaccess')) // ochranu si složka vytvoří sama
    @file_put_contents($d . '/.htaccess', "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
  return is_dir($d) && is_writable($d);
}
// klíče, které smí měnit jednotlivé role
function allowed_keys($perms) {
  if (in_array('admin', $perms, true)) return ['settings', 'types', 'sections', 'vehicles', 'people', 'calls', 'seq'];
  if (in_array('dispatch', $perms, true)) return ['vehicles', 'people', 'calls', 'seq'];
  if (in_array('commander', $perms, true)) return ['vehicles', 'calls', 'seq'];
  return [];
}
function merge_calls($stored, $incoming) { // sloučení podle čísla události, ať se neztratí výjezd od jiného dispečera
  $out = []; $seen = [];
  foreach (is_array($incoming) ? $incoming : [] as $c) { if (!is_array($c) || !isset($c['no'])) continue; $out[] = $c; $seen[(string)$c['no']] = true; }
  foreach (is_array($stored) ? $stored : [] as $c) if (is_array($c) && isset($c['no']) && empty($seen[(string)$c['no']])) $out[] = $c;
  usort($out, function ($a, $b) { $x = isset($a['t']) ? $a['t'] : 0; $y = isset($b['t']) ? $b['t'] : 0; return $x == $y ? 0 : ($x < $y ? -1 : 1); });
  return count($out) > 500 ? array_slice($out, -500) : $out;
}
function presence_file() { return __DIR__ . '/' . STATE_DIR . '/presence.php'; }
function presence_read() {
  $raw = @file_get_contents(presence_file());
  if ($raw === false) return [];
  $nl = strpos($raw, "\n");
  $j = json_decode($nl === false ? $raw : substr($raw, $nl + 1), true);
  if (!is_array($j)) return [];
  $now = (int)round(microtime(true) * 1000); $o = [];
  foreach ($j as $k => $v) if (is_numeric($v) && $now - $v < 300000) $o[(string)$k] = (int)$v;
  return $o;
}
function do_ping() { // jen značka "jsem online" – needitujeme kvůli tomu celý stav
  $sess = need_session();
  if (!ensure_dir(STATE_DIR)) out(200, ['ok' => false]);
  $fh = @fopen(presence_file(), 'c+');
  if (!$fh) out(200, ['ok' => false]);
  flock($fh, LOCK_EX);
  $raw = stream_get_contents($fh); $nl = strpos((string)$raw, "\n");
  $j = json_decode($nl === false ? (string)$raw : substr((string)$raw, $nl + 1), true);
  if (!is_array($j)) $j = [];
  $now = (int)round(microtime(true) * 1000);
  foreach ($j as $k => $v) if (!is_numeric($v) || $now - $v > 300000) unset($j[$k]);
  $j[(string)$sess['id']] = $now;
  ftruncate($fh, 0); rewind($fh); fwrite($fh, GUARD . json_encode($j, JF)); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
  out(200, ['ok' => true]);
}
function prealert_file() { return __DIR__ . '/' . STATE_DIR . '/prealert.php'; }
function prealert_read() { // předhlášení platí jen krátce
  $raw = @file_get_contents(prealert_file());
  if ($raw === false) return null;
  $nl = strpos($raw, "\n");
  $j = json_decode($nl === false ? $raw : substr($raw, $nl + 1), true);
  if (!is_array($j) || empty($j['t'])) return null;
  return ((int)round(microtime(true) * 1000) - (int)$j['t'] < 120000) ? $j : null;
}
function do_prealert() { // dispečer vybral jednotky a typ -> jim zahraje pre-gong ještě před vyhlášením
  $sess = need_session();
  if (!in_array('dispatch', $sess['perms'], true) && !in_array('admin', $sess['perms'], true)) out(403, ['error' => 'forbidden']);
  $b = body();
  $units = [];
  foreach ((isset($b['units']) && is_array($b['units'])) ? array_slice($b['units'], 0, 50) : [] as $u) if (is_numeric($u)) $units[] = (int)$u;
  $type = isset($b['type']) && is_numeric($b['type']) ? (int)$b['type'] : 0;
  if (!$units || !$type) out(400, ['error' => 'bad_request']);
  if (!ensure_dir(STATE_DIR)) out(200, ['ok' => false]);
  $j = ['t' => (int)round(microtime(true) * 1000), 'type' => $type, 'units' => $units];
  if (@file_put_contents(prealert_file(), GUARD . json_encode($j, JF)) === false) out(200, ['ok' => false]);
  out(200, ['ok' => true]);
}
function do_state() {
  global $SECRET_OK;
  if (!$SECRET_OK) out(503, ['error' => 'no_secret']);
  $sess = need_session();
  $m = $_SERVER['REQUEST_METHOD'];
  if ($m === 'GET') {
    $st = state_read();
    $rev = $st ? (int)(isset($st['rev']) ? $st['rev'] : 0) : 0;
    $have = isset($_GET['rev']) ? (int)$_GET['rev'] : -1;
    $pres = (object)presence_read(); $pre = prealert_read();
    if ($st && $have === $rev) out(200, ['rev' => $rev, 'same' => true, 'presence' => $pres, 'prealert' => $pre]);
    out(200, ['rev' => $rev, 'state' => $st ? $st : null, 'presence' => $pres, 'prealert' => $pre]);
  }
  if ($m !== 'POST') out(405, ['error' => 'method_not_allowed']);
  $b = body();
  $patch = isset($b['patch']) && is_array($b['patch']) ? $b['patch'] : null;
  if ($patch === null) out(400, ['error' => 'bad_request']);
  $allow = allowed_keys($sess['perms']);
  foreach (array_keys($patch) as $k) if (!in_array($k, $allow, true)) out(403, ['error' => 'forbidden_key', 'key' => $k]);
  if (!ensure_dir(STATE_DIR)) out(500, ['error' => 'not_writable', 'dir' => STATE_DIR]);
  $f = state_file();
  $fh = @fopen($f, 'c+');
  if (!$fh) out(500, ['error' => 'not_writable', 'dir' => STATE_DIR]);
  flock($fh, LOCK_EX);
  $raw = stream_get_contents($fh); $nl = strpos((string)$raw, "\n");
  $cur = json_decode($nl === false ? (string)$raw : substr((string)$raw, $nl + 1), true);
  if (!is_array($cur)) $cur = ['rev' => 0];
  foreach ($patch as $k => $v) {
    if ($k === 'calls') $cur['calls'] = merge_calls(isset($cur['calls']) ? $cur['calls'] : [], $v);
    elseif ($k === 'seq') $cur['seq'] = max((int)$v, (int)(isset($cur['seq']) ? $cur['seq'] : 1));
    else $cur[$k] = $v;
  }
  $cur['rev'] = (int)(isset($cur['rev']) ? $cur['rev'] : 0) + 1;
  $cur['at'] = (int)round(microtime(true) * 1000);
  $enc = json_encode($cur, JF);
  if ($enc === false) { flock($fh, LOCK_UN); fclose($fh); out(400, ['error' => 'bad_json']); }
  ftruncate($fh, 0); rewind($fh); fwrite($fh, GUARD . $enc); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
  out(200, ['rev' => $cur['rev'], 'state' => $cur]);
}
function register_person($user) { // propojení Discord účtu se seznamem osob provádí server
  if (!array_intersect(['fire', 'commander'], $user['perms'])) return;
  if (!ensure_dir(STATE_DIR)) return;
  $fh = @fopen(state_file(), 'c+'); if (!$fh) return;
  flock($fh, LOCK_EX);
  $raw = stream_get_contents($fh); $nl = strpos((string)$raw, "\n");
  $cur = json_decode($nl === false ? (string)$raw : substr((string)$raw, $nl + 1), true);
  if (!is_array($cur)) $cur = ['rev' => 0];
  if (!isset($cur['people']) || !is_array($cur['people'])) $cur['people'] = [];
  $found = false;
  foreach ($cur['people'] as $pp) if (isset($pp['did']) && (string)$pp['did'] === (string)$user['id']) { $found = true; break; }
  if (!$found) {
    $cur['people'][] = ['id' => (int)round(microtime(true) * 1000), 'name' => $user['name'], 'call' => '', 'did' => (string)$user['id'], 'rank' => '', 'vid' => 0];
    $cur['rev'] = (int)(isset($cur['rev']) ? $cur['rev'] : 0) + 1;
    $cur['at'] = (int)round(microtime(true) * 1000);
    ftruncate($fh, 0); rewind($fh); fwrite($fh, GUARD . json_encode($cur, JF)); fflush($fh);
  }
  flock($fh, LOCK_UN); fclose($fh);
}
function do_sound() { // nahrání gongu: uloží se na server, slyší ho všichni
  global $SECRET_OK;
  if (!$SECRET_OK) out(503, ['error' => 'no_secret']);
  $sess = need_session();
  if (!in_array('admin', $sess['perms'], true)) out(403, ['error' => 'forbidden']);
  $b = body();
  $name = strtolower((string)(isset($b['name']) ? $b['name'] : ''));
  $ext = preg_match('/\.([a-z0-9]{1,5})$/', $name, $mm) ? $mm[1] : '';
  $okext = ['mp3' => 'audio/mpeg', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg', 'wav' => 'audio/wav', 'm4a' => 'audio/mp4', 'aac' => 'audio/aac', 'webm' => 'audio/webm', 'mp4' => 'video/mp4'];
  if (!isset($okext[$ext])) out(400, ['error' => 'bad_type']);
  $data = isset($b['data']) && is_string($b['data']) ? $b['data'] : '';
  $data = preg_replace('#^data:[^,]*,#', '', $data);
  $bin = base64_decode($data, true);
  if ($bin === false || strlen($bin) < 16) out(400, ['error' => 'bad_data']);
  if (strlen($bin) > 8000000) out(413, ['error' => 'too_large']);
  if (!ensure_dir(SOUND_DIR)) out(500, ['error' => 'not_writable', 'dir' => SOUND_DIR]);
  $fn = preg_replace('/[^a-z0-9]+/', '-', (string)(isset($b['slot']) ? $b['slot'] : 'zvuk'));
  $fn = trim(substr($fn, 0, 24), '-'); if ($fn === '') $fn = 'zvuk';
  $file = $fn . '-' . bin2hex(function_exists('random_bytes') ? random_bytes(4) : pack('N', mt_rand())) . '.' . $ext;
  if (@file_put_contents(__DIR__ . '/' . SOUND_DIR . '/' . $file, $bin) === false) out(500, ['error' => 'not_writable', 'dir' => SOUND_DIR]);
  $old = isset($b['old']) ? (string)$b['old'] : '';
  if (preg_match('#^' . SOUND_DIR . '/[A-Za-z0-9._-]+$#', $old) && strpos($old, '..') === false) @unlink(__DIR__ . '/' . $old);
  out(200, ['url' => SOUND_DIR . '/' . $file]);
}
function clean_embed($e) { // do Discordu jde jen ověřená podoba embedu
  if (!is_array($e) || cut(isset($e['title']) ? $e['title'] : '', 256) === '') return null;
  $o = ['title' => cut($e['title'], 256)];
  if (isset($e['color']) && is_int($e['color']) && $e['color'] >= 0 && $e['color'] <= 0xFFFFFF) $o['color'] = $e['color'];
  if (!empty($e['timestamp']) && is_string($e['timestamp']) && ($t = strtotime($e['timestamp'])) !== false) $o['timestamp'] = gmdate('Y-m-d\TH:i:s\Z', $t);
  if (isset($e['footer']['text']) && is_string($e['footer']['text']) && $e['footer']['text'] !== '') $o['footer'] = ['text' => cut($e['footer']['text'], 2048)];
  $o['fields'] = [];
  $f = (isset($e['fields']) && is_array($e['fields'])) ? array_slice(array_values($e['fields']), 0, 10) : [];
  foreach ($f as $x) {
    $x = is_array($x) ? $x : [];
    $n = cut(isset($x['name']) ? $x['name'] : '', 256); $v = cut(isset($x['value']) ? $x['value'] : '', 1024);
    $o['fields'][] = ['name' => $n !== '' ? $n : '—', 'value' => $v !== '' ? $v : '—', 'inline' => !empty($x['inline'])];
  }
  return $o;
}
function do_backup() {
  global $hooks, $pings, $SECRET_OK;
  $b = body();
  if (!$SECRET_OK) out(503, ['error' => 'no_secret']);
  $sess = need_session();
  if (!in_array('dispatch', $sess['perms'], true) && !in_array('admin', $sess['perms'], true)) out(403, ['error' => 'forbidden']);
  if (limited(s($sess['id']))) out(429, ['error' => 'rate_limited']);
  $k = isset($b['kind']) ? $b['kind'] : null;
  if (!is_string($k) || !in_array($k, KINDS, true)) out(400, ['error' => 'bad_kind']);
  if (empty($hooks[$k])) out(400, ['error' => 'no_webhook']);
  $embed = clean_embed(isset($b['embed']) ? $b['embed'] : null);
  if (!$embed) out(400, ['error' => 'bad_embed']);
  $pid = isset($pings[$k]) ? $pings[$k] : null; // ping role z cad.env (embed sám nepinguje)
  $payload = ['username' => 'CAD', 'allowed_mentions' => $pid ? ['roles' => [$pid]] : ['parse' => []], 'embeds' => [$embed]];
  if ($pid) $payload['content'] = trim('<@&' . $pid . '> ' . cut(isset($b['text']) ? $b['text'] : '', 300));
  list($st) = http_request('POST', $hooks[$k], ['Content-Type: application/json'], json_encode($payload, JF));
  if ($st === 0) out(502, ['error' => 'webhook_unreachable']);
  if ($st < 200 || $st >= 300) out(502, ['error' => 'webhook_failed', 'status' => $st]);
  out(200, ['ok' => true]);
}

$r = isset($_GET['r']) ? (string)$_GET['r'] : '';
$m = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($r === 'config') { if ($m !== 'GET') out(405, ['error' => 'method_not_allowed']); out(200, public_config()); }
if ($r === 'session') { if ($m !== 'POST') out(405, ['error' => 'method_not_allowed']); do_session(); }
if ($r === 'backup') { if ($m !== 'POST') out(405, ['error' => 'method_not_allowed']); do_backup(); }
if ($r === 'me') { if ($m !== 'GET') out(405, ['error' => 'method_not_allowed']); $u = cur_session(); out(200, ['user' => $u ? ['id' => $u['id'], 'name' => $u['name'], 'perms' => $u['perms']] : null]); }
if ($r === 'logout') { if ($m !== 'POST') out(405, ['error' => 'method_not_allowed']); set_cookie('', false); out(200, ['ok' => true]); }
if ($r === 'state') { do_state(); }
if ($r === 'ping') { if ($m !== 'POST') out(405, ['error' => 'method_not_allowed']); do_ping(); }
if ($r === 'prealert') { if ($m !== 'POST') out(405, ['error' => 'method_not_allowed']); do_prealert(); }
if ($r === 'sound') { if ($m !== 'POST') out(405, ['error' => 'method_not_allowed']); do_sound(); }
out(404, ['error' => 'not_found']);
