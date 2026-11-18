# CAD – dispečink pro hasičský roleplay

Webový dispečerský systém (CAD) pro hasičský roleplay zasazený do České republiky.
Dispečer vyhlašuje výjezdy, vybraným jednotkám se v prohlížeči rozezní gong a česky je
přečte hlasové hlášení. Přihlášení a oprávnění se řídí rolemi na Discordu.

Celé rozhraní je v češtině. Běží na obyčejném PHP webhostingu – nepotřebuje databázi,
Node.js ani nic instalovat.

![verze](https://img.shields.io/badge/verze-v36-red) ![php](https://img.shields.io/badge/PHP-7.4%2B-blue) ![bez závislostí](https://img.shields.io/badge/závislosti-žádné-green)

---

## Co to umí

| Oblast | Popis |
|---|---|
| **Dispečink** | Zakládání výjezdů (typ, podtyp, priorita, místo, jednotky), poznámky, úpravy, ukončení |
| **Poplach** | Pre-gong při výběru jednotek, hlavní gong a hlasové hlášení při vyhlášení |
| **Hlasové hlášení** | Česky, s vlastní tabulkou výslovnosti zkratek (ZÚ → „Záchranný útvar“) |
| **Role** | Hasič, Velitel, Dispečer, Administrátor – podle rolí na Discordu |
| **Jednotky** | Vozidla, sekce, posádky, stavy s časovými značkami |
| **Posily** | Povolání ZÚ / JSDH / TM / ZPP přes Discord webhook s pingem role |
| **Historie** | Archiv všech událostí s časovou osou a poznámkami velitele |
| **Sdílená data** | Vše na serveru, všichni vidí totéž, změny do 3 sekund |

---

## Jak to funguje

### Architektura

Žádný framework, žádná databáze. Prohlížeč mluví s jedním PHP souborem, data leží
v jednom JSON souboru na disku.

```
  Prohlížeč                      Server (PHP)                  Discord
 ┌──────────────┐   api.php?r=…  ┌──────────────┐  OAuth2     ┌─────────┐
 │  index.html  │ ─────────────► │   api.php    │ ──────────► │  role   │
 │  app.js      │ ◄───────────── │              │             │ uživat. │
 │  style.css   │   JSON         │ cad.env.php  │  webhook    │         │
 └──────────────┘                │ cad-data/    │ ──────────► │ kanál   │
      ▲  každé 3 s                └──────────────┘             └─────────┘
      └── synchronizace stavu (rev)
```

* **`app.js`** – celá aplikace: vykreslování, zvuky, hlášení, synchronizace.
* **`api.php`** – jediný koncový bod serveru. Ověřuje přihlášení, ukládá stav, odesílá webhooky.
* **`server.js`** – nepovinná alternativa v Node.js se stejným rozhraním (pro VPS).
* **`cad.env.php`** – tajné nastavení (Discord, webhooky, klíč). **Nikdy nejde do Gitu.**
* **`cad-data/`** – data systému, vytvoří se samo.

### Soubory

| Soubor | K čemu je |
|---|---|
| `index.html` | Kostra stránky, načítá `app.js` |
| `app.js` | Veškerá logika v prohlížeči (~950 řádků, bez knihoven) |
| `style.css` | Vzhled – tmavý velín, jedna signální barva |
| `api.php` | Server: přihlášení, sdílený stav, zvuky, webhooky |
| `callback.html` | Návrat z Discord přihlášení |
| `diag.php` | Diagnostika instalace (po zprovoznění smazat) |
| `server.js` | Varianta pro Node.js 18+ místo PHP |
| `.htaccess` | Zákaz stažení tajných souborů + bezpečnostní hlavičky |
| `NASAZENI.md` | Podrobný návod na nahrání přes FTP / webFTP |

### Přihlášení a role

1. Uživatel klikne na **Přihlásit přes Discord** → přesměrování na Discord.
2. Discord vrátí token na `callback.html`.
3. **Token ověřuje server**, ne prohlížeč: zeptá se Discordu, jestli je uživatel členem
   serveru a jaké má role.
4. Role z `cad.env.php` se přeloží na oprávnění a server vystaví **podepsanou cookie**
   (HMAC-SHA256, platnost 30 dní).

V prohlížeči se neukládá nic kromě této přihlašovací cookie – žádný localStorage.

| Role | Co smí měnit |
|---|---|
| **Administrátor** | nastavení, typy, sekce, vozidla, osoby, události |
| **Dispečer** | vozidla, osoby, události |
| **Velitel** | vozidla, události (stav své jednotky, poznámky) |
| **Hasič** | nic – jen čte |

Oprávnění **hlídá server**, ne jen rozhraní.

### Sdílený stav

Všechna data jsou v `cad-data/state.php` jako JSON za řádkem `<?php exit; ?>`.
Když si soubor někdo otevře v prohlížeči, PHP ho spustí a nevypíše **nic**.

* Prohlížeč se každé 3 sekundy ptá `api.php?r=state&rev=N`.
* Když se číslo verze (`rev`) nezměnilo, server odpoví jen `same: true`.
* Zápis posílá jen změněné části; události se slučují podle čísla, takže se při
  souběžné práci dvou dispečerů žádná neztratí (zamykání přes `flock`).

### Poplach a zvuky

1. Dispečer vybere **typ události a jednotky** → vybraným jednotkám se přehraje
   **pre-gong** daného typu (pokud je nahraný). Nic víc.
2. Po vyhlášení se přehraje **hlavní gong** a následně **hlasové hlášení**.
3. Hlášení přečte typ, podtyp, adresu, poznámku a jednotky – ale **jen jednotky
   z vlastní sekce posluchače**. Ostatní jsou vidět na obrazovce.

Zvuky se nahrávají v Adminu a ukládají na server do `media/sounds/`, takže je slyší
všichni stejně.

### Výslovnost

Tabulka v **Admin → Výslovnost** převádí zkratky na celá slova, aby hlášení znělo přirozeně:

| Zkratka | Přečte se |
|---|---|
| ZÚ | Záchranný útvar |
| TM | Tiskový mluvčí |
| CAS | cisternová automobilová stříkačka |

Nahrazuje se jen samostatné slovo (v „BANKOMAT“ se „TM“ nenahradí), na velikosti
písmen nezáleží a delší zkratka má přednost.

### Povolávání posil

Tlačítka **Povolat ZÚ / JSDH / TM / ZPP** u aktivní události:

1. Nabídnou vozidla označená pro daný druh (**Admin → Vozidla → „Povolávat jako“**) –
   nezávisle na tom, v jaké jsou sekci.
2. Po potvrzení odešlou **embed na Discord** s událostí, adresou, prioritou a jednotkami.
3. Pingnou **jednu roli** nastavenou v `cad.env.php` (webhook samotný embed nepinguje).
4. Vozidla připojí k události. Stav si jednotka nastavuje sama.

V okně **Upravit událost** lze jednotky připojit i bez webhooku a bez poplachu.

---

## Nastavení repozitáře

```bash
git clone https://github.com/<uzivatel>/<repo>.git
cd <repo>
cp .env.example cad.env.php      # vyplnit, NIKDY necommitovat
```

> **Do Gitu nikdy nepatří `cad.env.php`** – obsahuje webhooky, ID rolí a `SESSION_SECRET`.
> Soubor `.gitignore` ho už blokuje, stejně jako složku `cad-data/` a nahrané zvuky.
> Pokud se tajné údaje někdy dostaly do historie commitů, smažte webhooky v Discordu,
> vytvořte nové a změňte `SESSION_SECRET`.

První řádek souboru `cad.env.php` **musí** zůstat:

```php
<?php exit; /* ?>
```

Díky němu PHP soubor při otevření v prohlížeči spustí a nevypíše nic – obsah je
chráněný i ve veřejné složce webu.

### Lokální vyzkoušení

```bash
php -S 127.0.0.1:8000        # otevřete http://127.0.0.1:8000
# nebo
node server.js               # Node.js 18+
```

Pro zkoušení bez Discordu nastavte `ALLOW_DEMO=true`. **Na veřejném webu vždy `false`** –
jinak se kdokoli přihlásí jako administrátor.

### Nasazení

Nahrajte obsah repozitáře (bez `cad.env.php`) do složky webu, `cad.env.php` vyplňte
přímo na serveru. Složky `cad-data/` a `media/sounds/` si aplikace vytvoří sama –
musí do nich jít zapisovat (práva 755, u některých hostingů 775 nebo 777).

Podrobný postup včetně webFTP a Českého hostingu: **[NASAZENI.md](NASAZENI.md)**.

Po nahrání otevřete `diag.php` – zkontroluje PHP, verze souborů, nastavení i práva.
Potom ho ze serveru smažte.

---

## Nastavení (cad.env.php)

| Proměnná | Význam |
|---|---|
| `DISCORD_CLIENT_ID` | ID aplikace z Discord Developer Portal |
| `DISCORD_GUILD_ID` | ID vašeho Discord serveru |
| `DISCORD_ROLE_ADMIN/_DISPATCH/_FIRE/_COMMANDER` | ID rolí → oprávnění |
| `REDIRECT_URL` | Nepovinné; výchozí je `…/callback.html` |
| `SESSION_SECRET` | Náhodný text min. 32 znaků. **Bez něj se nikdo nepřihlásí** |
| `ALLOW_DEMO` | `true` jen pro testování |
| `WEBHOOK_DEFAULT` | Výchozí kanál pro povolávání posil |
| `WEBHOOK_ZU/_JSDH/_TM/_ZPP` | Vlastní kanál pro konkrétní druh |
| `WEBHOOK_DENNI` | Společný kanál pro TM i ZPP (denní zaměstnanci) |
| `PING_ZU/_JSDH/_TM/_ZPP` | ID role, která se pingne – **u každého druhu jiná** |

Pořadí kanálu: `WEBHOOK_<DRUH>` → `WEBHOOK_DENNI` (jen TM/ZPP) → `WEBHOOK_DEFAULT`.

V Discord Developer Portal → OAuth2 → Redirects přidejte přesnou adresu
`https://vase-domena.cz/<slozka>/callback.html`.

---

## Rozhraní serveru

Vše přes `api.php?r=<akce>`. Přihlášení se předává podepsanou cookie.

| Akce | Metoda | Popis |
|---|---|---|
| `config` | GET | Veřejné nastavení (co je vyplněné) – **bez tajných hodnot** |
| `session` | POST | Přihlášení (Discord token nebo demo) → nastaví cookie |
| `me` | GET | Kdo je přihlášený |
| `logout` | POST | Odhlášení |
| `state` | GET/POST | Sdílený stav; zápis podle oprávnění role |
| `ping` | POST | Značka „jsem online“ (nemění stav) |
| `prealert` | POST | Předhlášení – pre-gong vybraným jednotkám |
| `sound` | POST | Nahrání gongu (jen administrátor) |
| `backup` | POST | Odeslání webhooku na Discord (dispečer, administrátor) |

---

## Bezpečnost

* Tajné hodnoty **nikdy neopustí server** – `api.php?r=config` hlásí jen *vyplněno / chybí*.
* `cad.env.php`, `state.php` i `presence.php` začínají `<?php exit;` – v prohlížeči nic nevypíšou.
* `.htaccess` navíc blokuje stažení a přidává bezpečnostní hlavičky (CSP, nosniff, X-Frame-Options).
* Oprávnění rolí kontroluje server u každého zápisu.
* Relace je podepsaná HMAC-SHA256; podvržený nebo pozměněný token server odmítne.
* Odeslání na Discord je omezené na 12 zpráv za minutu na uživatele.
* Embed se před odesláním očistí a ořízne na limity Discordu.
* Ping je vždy jen jedna role – `allowed_mentions` nedovolí `@everyone`.

**Doporučení:** provozujte přes HTTPS (v `.htaccess` je připravené přesměrování)
a `ALLOW_DEMO` držte na `false`.

---

## Požadavky

* **PHP 7.4, 8.2 nebo 8.4** (funkce `curl` nebo `allow_url_fopen`)
* Apache nebo LiteSpeed kvůli `.htaccess` (na nginx viz NASAZENI.md)
* Nepovinně Node.js 18+ místo PHP
* Pro české hlášení **český hlas v systému** uživatele (na Linuxu `speech-dispatcher` + `espeak-ng`)

Prohlížeč: Chrome, Edge, Firefox nebo Safari v aktuální verzi.
Zvuk se přehraje až po prvním kliknutí do stránky – to vyžadují samy prohlížeče.

---

## Časté potíže

| Problém | Řešení |
|---|---|
| Hlášení mluví anglicky | Nainstalovat český hlas; v Admin → Server vybrat konkrétní hlas |
| Nic se neukládá | Práva složky `cad-data/`; `diag.php` to ověří |
| Po přihlášení zpět na přihlášení | Redirect URL v Discordu se musí přesně shodovat |
| Změny se neprojeví | Starý soubor v mezipaměti – Ctrl+F5; verzi ukazuje `diag.php` |
| Nejde povolat TM/ZPP | Vozidla musí mít v Admin → Vozidla nastavené „Povolávat jako“ |

---

## Licence a autoři

Systém vznikl na zakázku pro hasičský roleplay server a je určený k vlastnímu použití
i úpravám. Není to skutečný záchranný systém – **ve skutečné nouzi volejte 112 nebo 150.**

* **Zadání, testování v provozu a provoz:** majitel repozitáře
* **Návrh a naprogramování:** [Claude](https://claude.ai) (model Opus 5, Anthropic) –
  kompletní kód, vzhled i dokumentace vznikly v konverzaci s Claudem

Při dalších úpravách prosím zachovejte tento oddíl.
