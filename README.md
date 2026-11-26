# Psalmen-Bot (Telegram)

Telegram-Bot zum Sammelband: Suche, Sammlungen, Favoriten, gemeinsame Ordner und Freigabe neuer Nutzer durch den Admin.

## Funktionen
- Suche nach Nummer (`5` = Песни Юности), Code (`н5`, `юс 120`), Titel, erster Zeile und im ganzen Text
- Psalm-Ansicht mit ◀️ ▶️, Favorit, „📁 В папку“ und Knopf zum Öffnen in der Mini App
- `/papki` — gemeinsame Ordner. Sie liegen auf dem Website-Server (`MINIAPP_URL/api/folders`), Bot und Website sehen also dieselben Ordner
- Admin: `/admin`, Anfragen freigeben/ablehnen, sperren/entsperren, Statistik (unverändert)

## Variablen
| Name | Zweck |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot-Token |
| `ADMIN_CHAT_ID` | Telegram-ID des Admins |
| `ADMIN_TOKEN` | Token für die Admin-API |
| `DATA_DIR` | Ordner für `access.json`, `favorites.json`, `prefs.json` – auf Railway ein Volume (z. B. `/data`), sonst gehen Freigaben bei jedem Deploy verloren |
| `ACCESS_DATA` | optional: Startwert für `access.json`, wird nur genutzt, solange die Datei noch nicht existiert |
| `MINIAPP_URL` | Adresse der Website (Standard: die Railway-Adresse der MiniApp) |

Die Psalmtexte in `data/` sind dieselben wie in der MiniApp.
