<?php
/* Diagnostika CAD – otevřete v prohlížeči: https://vase-domena.cz/cad/diag.php
   Nevypisuje žádné tajné hodnoty. Po vyřešení potíží soubor smažte. */
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
function h($x) { return htmlspecialchars((string)$x, ENT_QUOTES, 'UTF-8'); }
$D = __DIR__;
$rows = []; $bad = 0;
function row(&$rows, &$bad, $name, $okv, $val, $hint = '') {
  $rows[] = [$name, $okv, $val, $hint]; if (!$okv) $bad++;
}
// --- PHP ---
row($rows, $bad, 'Verze PHP', version_compare(PHP_VERSION, '7.2', '>='), PHP_VERSION, 'Potřeba 7.2 a vyšší');
row($rows, $bad, 'Funkce curl', function_exists('curl_init') || ini_get('allow_url_fopen'), function_exists('curl_init') ? 'curl' : (ini_get('allow_url_fopen') ? 'allow_url_fopen' : 'chybí'), 'Bez toho nejde Discord ani webhooky');

// --- soubory aplikace ---
$files = ['index.html', 'app.js', 'api.php', 'style.css', 'callback.html', '.htaccess', 'cad.env.php', 'media/.htaccess'];
$list = '';
foreach ($files as $f) {
  $p = $D . '/' . $f;
  $list .= '<tr><td><code>' . h($f) . '</code></td><td>' . (is_file($p) ? number_format(filesize($p)) . ' B' : '<b style="color:#c00">CHYBÍ</b>')
    . '</td><td>' . (is_file($p) ? date('j.n.Y H:i', filemtime($p)) : '—') . '</td></tr>';
}
// --- verze app.js vs. co načítá index.html ---
$appjs = @file_get_contents($D . '/app.js');
$idx = @file_get_contents($D . '/index.html');
$vApp = ($appjs !== false && preg_match("/APPV\s*=\s*'(\d+)'/", $appjs, $m)) ? $m[1] : null;
$vIdx = ($idx !== false && preg_match('/app\.js\?v=(\d+)/', $idx, $m2)) ? $m2[1] : null;
row($rows, $bad, 'Verze souboru app.js', $vApp !== null, $vApp === null ? 'nenalezena (starý app.js)' : 'v' . $vApp, 'Nejnovější je v36');
row($rows, $bad, 'Verzi načítá index.html', $vIdx !== null && $vIdx === $vApp, $vIdx === null ? 'nenalezena' : 'v' . $vIdx,
  ($vIdx !== $vApp) ? 'NESOUHLASÍ s app.js – nahrajte oba soubory znovu' : '');
row($rows, $bad, 'app.js umí výslovnost', $appjs !== false && strpos($appjs, 'DEF_PRON') !== false, ($appjs !== false && strpos($appjs, 'DEF_PRON') !== false) ? 'ano' : 'NE – starý app.js', 'Nahrajte nový app.js');
row($rows, $bad, 'api.php umí sdílený stav', ($a = @file_get_contents($D . '/api.php')) !== false && strpos($a, "do_state") !== false, (isset($a) && $a !== false && strpos($a, 'do_state') !== false) ? 'ano' : 'NE – starý api.php', 'Nahrajte nový api.php');

// --- nastavení ---
$envPath = null;
foreach ([$D, dirname($D), dirname($D, 2), dirname($D, 3)] as $d) {
  foreach (['/cad.env.php', '/cad.env'] as $n) if (@is_file($d . $n)) { $envPath = $d . $n; break 2; }
}
row($rows, $bad, 'Soubor s nastavením', $envPath !== null, $envPath ? str_replace($D, '.', $envPath) : 'NENALEZEN', 'Musí být cad.env.php ve složce aplikace');
$secret = false; $demo = '?';
if ($envPath) {
  foreach (preg_split('/\r?\n/', (string)@file_get_contents($envPath)) as $ln) {
    $ln = trim($ln); if ($ln === '' || $ln[0] === '#') continue;
    $i = strpos($ln, '='); if ($i < 1) continue;
    $k = trim(substr($ln, 0, $i)); $v = trim(substr($ln, $i + 1));
    if ($k === 'SESSION_SECRET') $secret = strlen(trim($v, '"\'')) >= 16;
    if ($k === 'ALLOW_DEMO') $demo = $v;
  }
}
row($rows, $bad, 'SESSION_SECRET', $secret, $secret ? 'nastaven (alespoň 16 znaků)' : 'CHYBÍ nebo je krátký', 'Bez něj se nikdo nepřihlásí');
$rows[] = ['ALLOW_DEMO', true, h($demo), 'Na veřejném webu má být false'];

// --- zápis na disk ---
function wtest($dir) {
  if (!is_dir($dir) && !@mkdir($dir, 0775, true)) return [false, 'složku nelze vytvořit'];
  $f = $dir . '/_test_' . mt_rand() . '.tmp';
  if (@file_put_contents($f, 'x') === false) return [false, 'do složky nelze zapsat (nastavte práva 775 nebo 777)'];
  $okread = @file_get_contents($f) === 'x'; @unlink($f);
  return [$okread, $okread ? 'zápis i čtení OK (práva ' . substr(sprintf('%o', @fileperms($dir)), -3) . ')' : 'zápis prošel, ale čtení ne'];
}
list($w1, $m1) = wtest($D . '/cad-data');
row($rows, $bad, 'Zápis do cad-data', $w1, $m1);
list($w2, $m2x) = wtest($D . '/media/sounds');
row($rows, $bad, 'Zápis do media/sounds', $w2, $m2x);

// --- uložená data ---
$raw = @file_get_contents($D . '/cad-data/state.php');
$st = null;
if ($raw !== false) { $nl = strpos($raw, "\n"); $st = json_decode($nl === false ? $raw : substr($raw, $nl + 1), true); }
if (is_array($st)) {
  $pron = isset($st['settings']['pron']) && is_array($st['settings']['pron']) ? count($st['settings']['pron']) : 0;
  $rows[] = ['Uložená data', true, 'rev ' . (int)(isset($st['rev']) ? $st['rev'] : 0)
    . ', vozidel ' . (isset($st['vehicles']) ? count($st['vehicles']) : 0)
    . ', osob ' . (isset($st['people']) ? count($st['people']) : 0)
    . ', událostí ' . (isset($st['calls']) ? count($st['calls']) : 0), ''];
  row($rows, $bad, 'Výslovnost uložena na serveru', $pron > 0, $pron > 0 ? $pron . ' zkratek' : 'žádná (ještě se neuložila)', '');
} else {
  $rows[] = ['Uložená data', true, 'zatím žádná (soubor cad-data/state.php ještě nevznikl)', 'Normální u nové instalace – vznikne při prvním uložení'];
}
$rows[] = ['Přihlášen (cookie)', true, isset($_COOKIE['cad_sess']) ? 'ano' : 'ne (jen informace)', ''];
?>
<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diagnostika CAD</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#121b24;color:#e6edf3;margin:0;padding:1.5rem}
h1{font-size:1.3rem}table{border-collapse:collapse;width:100%;max-width:1000px;margin:1rem 0}
td,th{border-bottom:1px solid #2c3c4c;padding:.5rem;text-align:left;vertical-align:top}
code{background:#0f1720;padding:.1rem .4rem;border-radius:4px}
.ok{color:#3fb27f;font-weight:700}.no{color:#ff8b94;font-weight:700}
.box{background:#1b2733;border-left:5px solid #f2b134;padding:1rem;max-width:1000px;border-radius:6px}</style></head><body>
<h1>Diagnostika CAD</h1>
<?php if ($bad): ?><div class="box"><b>Nalezeno <?= $bad ?> možných příčin potíží</b> – jsou označené červeně. Pošlete tuto stránku (nebo snímek obrazovky).</div>
<?php else: ?><div class="box"><b>Vše vypadá v pořádku.</b> Pokud aplikace přesto nefunguje, pošlete snímek této stránky.</div><?php endif; ?>
<table><tr><th>Kontrola</th><th>Stav</th><th>Hodnota</th><th>Poznámka</th></tr>
<?php foreach ($rows as $r): ?>
<tr><td><?= h($r[0]) ?></td><td class="<?= $r[1] ? 'ok' : 'no' ?>"><?= $r[1] ? 'OK' : 'CHYBA' ?></td><td><?= h($r[2]) ?></td><td><?= h($r[3]) ?></td></tr>
<?php endforeach; ?>
</table>
<h2>Soubory ve složce aplikace</h2>
<table><tr><th>Soubor</th><th>Velikost</th><th>Nahráno</th></tr><?= $list ?></table>
<h2>Co vidí váš prohlížeč</h2>
<p>Na disku serveru je app.js <b>v<?= h($vApp) ?></b>. Pokud se níže objeví jiné číslo, váš prohlížeč používá starou verzi z paměti – stiskněte <b>Ctrl+F5</b>.</p>
<p id="bver" style="font-size:1.2rem"><b>Zjišťuji…</b></p>
<script>
fetch('app.js').then(r => r.text()).then(t => {
  var m = t.match(/APPV\s*=\s*'(\d+)'/), disk = <?= json_encode($vApp) ?>;
  var el = document.getElementById('bver');
  if (!m) { el.innerHTML = '<b style="color:#ff8b94">Prohlížeč má starý app.js (bez verze) – stiskněte Ctrl+F5.</b>'; return; }
  el.innerHTML = m[1] === disk
    ? '<b style="color:#3fb27f">Prohlížeč používá v' + m[1] + ' – stejnou jako server. V pořádku.</b>'
    : '<b style="color:#ff8b94">Prohlížeč používá v' + m[1] + ', ale na serveru je v' + disk + ' – stiskněte Ctrl+F5.</b>';
}).catch(function () { document.getElementById('bver').textContent = 'Nepodařilo se načíst app.js.'; });
</script>
<p>Složka aplikace: <code><?= h($D) ?></code></p>
<p><b>Až potíže vyřešíte, soubor <code>diag.php</code> z webu smažte.</b></p>
</body></html>
