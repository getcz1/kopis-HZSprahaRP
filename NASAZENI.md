# CAD – nasazení přes webFTP

Aplikace potřebuje na serveru jen **PHP 7.4 / 8.2 / 8.4** (soubor `api.php`). Node.js není potřeba.
Všechno leží v jedné složce a nic se nenahrává nad kořen webu – stačí tedy webFTP.

## 1. Co nahrát

Ve webFTP otevřete složku svého webu (u Českého hostingu se jmenuje podle domény, např. `example.com`),
vytvořte v ní složku pro aplikaci – třeba `cad` – a do ní nahrajte:

```
example.com/
    cad/                     <- složka aplikace (může se jmenovat jakkoli)
        index.html
        callback.html
        style.css
        app.js
        api.php
        cad.env.php          <- nastavení (vyplňte, viz bod 2)
        .htaccess            <- skrytý soubor, nahrajte také
        media/
            .htaccess        <- skrytý soubor
            vase-video.mp4   <- volitelně video do rohu dispečinku
```

Aplikace pak běží na `https://example.com/cad/`.
Chcete-li ji mít přímo na `https://example.com/`, nahrajte soubory rovnou do složky webu – funguje to stejně.

* Složky `cad-data` a `media/sounds` **nevytvářejte** – aplikace si je při prvním použití založí sama
  (včetně vlastní ochrany proti stažení).
* `server.js`, `package.json` a `README.md` na PHP hosting **nepotřebujete**, nenahrávejte je.
* `.htaccess` je skrytý soubor. Pokud ho webFTP nezobrazuje nebo nenahraje, vytvořte ho přes
  *New file* / *Nový soubor*, pojmenujte přesně `.htaccess` a vložte jeho obsah.
  Když to nejde vůbec, nevadí – `cad.env.php` i data jsou chráněné i bez něj (viz bod 4).

## 2. Vyplnění cad.env.php

Otevřete `cad.env.php` ve webFTP tlačítkem *Edit*, vyplňte hodnoty a uložte.
**První řádek `<?php exit; /* ?>` nikdy nemažte** a soubor musí zůstat s příponou `.php` –
díky tomu se jeho obsah v prohlížeči nikdy nezobrazí.

* `SESSION_SECRET` – dlouhý náhodný text (alespoň 32 znaků). **Bez něj se nikdo nepřihlásí.**
* `ALLOW_DEMO=false` – na veřejném webu nechte vypnuté (jinak se kdokoli přihlásí jako administrátor).
* Discord: `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` a role `DISCORD_ROLE_ADMIN / _DISPATCH / _FIRE / _COMMANDER`.
* Povolávání posil: `WEBHOOK_DEFAULT`, `WEBHOOK_ZU`, `WEBHOOK_JSDH`, `WEBHOOK_TM`, `WEBHOOK_ZPP`
* Denní zaměstnanci (TM a ZPP) do jednoho kanálu: vyplňte jen `WEBHOOK_DENNI` a `WEBHOOK_TM`
  i `WEBHOOK_ZPP` nechte prázdné. Pořadí: `WEBHOOK_TM` → `WEBHOOK_DENNI` → `WEBHOOK_DEFAULT`.
* `PING_TM` a `PING_ZPP` musí být **dvě různé role** – ne jedna společná, ve které jsou obě
  skupiny, jinak se při každém povolání pingnou všichni.
  a ping rolí `PING_ZU`, `PING_JSDH`, `PING_TM`, `PING_ZPP`.
* V Discord Developer Portal → OAuth2 → Redirects přidejte **přesnou** adresu včetně podsložky,
  např. `https://example.com/cad/callback.html`. Stejnou adresu ukazuje i Admin → Discord.

## 3. Práva složek

Všechna data (nastavení, gongy, jednotky, osoby, události) jsou **na serveru**, aby je všichni viděli stejně.
Server do nich musí umět zapisovat. Pokud se při prvním uložení objeví hláška
„Server nemůže zapisovat do složky …", nastavte ve webFTP (pravým tlačítkem → *Chmod* / *Práva*):

| Složka | Práva |
|---|---|
| `cad/` (aby si mohla založit podsložky) | 755, případně 775 nebo 777 |
| `cad/cad-data/` (data systému) | 755, případně 775 nebo 777 |
| `cad/media/sounds/` (nahrané gongy) | 755, případně 775 nebo 777 |

V prohlížeči se neukládá nic kromě přihlašovací cookie. Změny se ostatním projeví do 3 sekund.

## 4. Kontrola po nahrání

1. Otevřete `https://example.com/cad/` – musí se zobrazit přihlášení.
2. Přihlaste se jako administrátor → **Admin → Discord**. Nahoře musí svítit „Zabezpečeno“
   a žádné červené varování. Aplikace sama zkouší, zda lze z webu stáhnout `cad.env.php` a další soubory.
3. Ručně otevřete `https://example.com/cad/cad.env.php` – musí být **prázdná stránka nebo chyba 403**,
   nikdy obsah souboru.
4. Pokud se obsah někdy zobrazil, smažte v Discordu webhooky, vytvořte nové a změňte `SESSION_SECRET`.

## 5. Výslovnost zkratek (hlasové hlášení)

Hlášení mluví česky a zkratky čte celým slovem. Tabulku upravíte v **Admin → Výslovnost**
(platí pro všechny uživatele, ukládá se na server). Předvyplněno je:

| Zkratka | Přečte se jako |
|---|---|
| ZÚ | Záchranný útvar |
| TM | Tiskový mluvčí |
| JSDH | Jednotka sboru dobrovolných hasičů |
| HZS | Hasičský záchranný sbor |
| CAS | cisternová automobilová stříkačka |
| DA | dopravní automobil |
| AZ | automobilový žebřík |
| PHA | Praha |

### Český hlas na jednotlivých počítačích

Hlášení používá hlas nainstalovaný v operačním systému, takže **každý uživatel si ho musí mít u sebe**.
Pokud chybí, aplikace to po přihlášení sama napíše i s návodem. Konkrétní hlas lze vybrat
v **Admin → Server → Hlas pro hlášení** (volba platí pro všechny, použije se, pokud ji počítač má).

* **Windows:** Nastavení → Čas a jazyk → Řeč → Spravovat hlasy → Přidat hlasy → Čeština, pak restart prohlížeče.
* **macOS:** Nastavení → Zpřístupnění → Mluvený obsah → Systémový hlas → Spravovat hlasy → Čeština (Zuzana).
* **Android:** Nastavení → Usnadnění → Převod textu na řeč → u Google TTS stáhnout češtinu.
* **iPhone/iPad:** Nastavení → Zpřístupnění → Mluvený obsah → Hlasy → Čeština.
* **Linux:** prohlížeče berou hlasy ze `speech-dispatcheru`, bez něj nemluví vůbec:

```sh
sudo apt install speech-dispatcher espeak-ng     # Debian, Ubuntu, Mint
sudo dnf install speech-dispatcher espeak-ng     # Fedora
sudo pacman -S speech-dispatcher espeak-ng       # Arch

spd-say -l | grep cs                 # ověření, že je čeština k dispozici
spd-say -l cs "zkouška hlášení"      # zkouška mimo prohlížeč
```

Pak restartujte prohlížeč. Ve Firefoxu musí být v `about:config` zapnuté
`media.webspeech.synth.enabled` (výchozí je zapnuto). Hlas z `espeak-ng` zní strojově;
hezčí češtinu dá balíček **RHVoice**, v Chrome fungují i online hlasy Google (vyžadují internet).

Tlačítkem **▶ Zkouška** si řádek hned poslechnete. Zkratka se nahradí jen jako samostatné slovo
(v „BANKOMAT" se „TM" nenahradí) a na velikosti písmen nezáleží.
Pro češtinu musí mít počítač nainstalovaný český hlas – jinak Windows přečte text cizím hlasem.

## 6. Zálohování

Stáhněte přes FTP složky `cad/cad-data/` (události, jednotky, osoby, nastavení)
a `cad/media/sounds/` (gongy). To je celá databáze systému.

## 7. Hosting bez Apache (nginx)

`.htaccess` nginx ignoruje. Ochrana pak stojí na tom, že `cad.env.php`, `cad-data/state.php`
i `cad-data/presence.php` začínají `<?php exit;` a PHP je nevypíše. Do konfigurace webu lze přidat:

```
location ~* /cad-data/ { deny all; }
location ~* \.(env|ini|log|bak|sql)$ { deny all; }
```

## 8. Alternativa: Node.js (VPS)

`node server.js` (Node 18+), stejné rozhraní i stejný `cad.env.php`.
