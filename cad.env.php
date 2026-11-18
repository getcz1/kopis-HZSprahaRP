<?php exit; /* ?>
# ===================================================================
#  NASTAVENI CAD  -  tento soubor je bezpecny i ve verejne slozce webu:
#  pri otevreni v prohlizeci ho PHP spusti a nevypise NIC.
#  PRVNI RADEK (<?php exit; /* ?>) NIKDY NEMAZTE ani needitujte!
#  Soubor musi koncit na .php  (cad.env.php), jinak ochrana neplati.
# ===================================================================


# PORT se používá jen u varianty s Node.js (node server.js); u PHP hostingu ho ignorujte.
PORT=3000

# --- Discord přihlášení (Developer Portal -> vaše aplikace) ---
DISCORD_CLIENT_ID=1480476501991358586
DISCORD_GUILD_ID=1470074429286514806            # ID Discord serveru (pravý klik na server -> Copy Server ID)
# ID rolí (Server Settings -> Roles -> pravý klik -> Copy Role ID). Stačí vyplnit ty, které používáte.
DISCORD_ROLE_ADMIN=1518939317404172298
DISCORD_ROLE_DISPATCH=1569308905773998242
DISCORD_ROLE_FIRE=1470074429831909498
DISCORD_ROLE_COMMANDER=1470074430091821167
# Volitelně: jiná Redirect URL (výchozí je adresa vašeho webu + /callback.html). Musí být stejná v Discord Developer Portal.
REDIRECT_URL=https://filip.hostan.eu/kopis/callback.html

# --- Tajný klíč pro podpis přihlášení: libovolný dlouhý náhodný text (alespoň 32 znaků, použijte generátor hesel). Bez něj se nikdo nepřihlásí. ---
SESSION_SECRET=uvqT2vD4K97mgRODZVriTmBgIGNFnOiT0xbAP7HKYs3czvEHKW

# --- Demo režim (přihlášení bez Discordu, jen pro testování). NA VEŘEJNÉM WEBU MUSÍ BÝT false (jinak se kdokoli přihlásí jako admin) ---
ALLOW_DEMO=false

# --- Webhooky pro tlačítka "Povolat" (Nastavení kanálu -> Integrace -> Webhooky) ---
# Výchozí webhook se použije, pokud není nastaven konkrétní.
WEBHOOK_DEFAULT=
WEBHOOK_ZU=https://discord.com/api/webhooks/1572571511620108390/BKoChBAv1QNfNg019Ozk-xUBLTL7KQXfHEl6SLKqlNxoMe6GGfQ5_4PFZn0ntd0cqf14
WEBHOOK_JSDH=
WEBHOOK_TM=
WEBHOOK_ZPP=
# Společný kanál pro denní zaměstnance (TM i ZPP). Vyplňte jen tento řádek a WEBHOOK_TM
# i WEBHOOK_ZPP nechte prázdné – obě povolání pak chodí do jednoho kanálu.
WEBHOOK_DENNI=https://discord.com/api/webhooks/1572571647876010004/Zt0zAGwlv5FEUF7eEIfhFPd4kGQEqCHiRs4G3SwAkZYTuOyTpROPF9t1wXYECCQNb9Yz

# --- Role, která se má pingnout při povolání (ID role). Prázdné = bez pingu. ---
# Role musí mít na Discordu povolené zmiňování (@mention), jinak ji webhook nepingne.
PING_ZU=1526207238925062225
PING_JSDH=
PING_TM=1558572947088744500
PING_ZPP=1514699194395529246

# */
