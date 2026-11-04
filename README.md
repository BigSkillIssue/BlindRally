# Blind Rally

3D-Rallyespiel für zwei Personen im Browser. Der Fahrer sieht den Waldpass aus der Fahrzeugperspektive. Nur der Beifahrer hat eine Streckenkarte, die Live-Position und Hinweise zur nächsten Kurve. Ihr startet gemeinsam und versucht, eure Bestzeit auf der rund 1,2 km langen Schotteretappe zu schlagen.

## Starten

Voraussetzung: **Node.js 20 oder neuer** und ein Browser mit WebGL 2 für den Fahrer.

```sh
npm start
```

Öffne [localhost:8080](http://localhost:8080), erstelle einen Raum und teile den Code oder den Einladungslink. Zum Testen auf einem Gerät den Link in einem privaten Browserfenster öffnen. Auf zwei Geräten im selben WLAN statt `localhost` die lokale IP des Rechners verwenden, auf dem Node läuft. Beide klicken auf **Bereit**.

- **Fahrer:** WASD oder Pfeiltasten, Leertaste für die Handbremse, R zum Zurücksetzen (+5 Sekunden). Auf Touch-Geräten gibt es Bildschirmtasten.
- **Beifahrer:** Markierte Kurve per Knopf durchgeben, Schnellansagen nutzen oder eine eigene Ansage schreiben. Beim Fahrer erscheinen die Ansagen als Text; er kann die Sprachausgabe einschalten. Für ein freies Gespräch könnt ihr parallel telefonieren.
- **Ziel:** Die Zeit stoppt erst nach allen Kontrollpunkten. Danach könnt ihr eine neue Fahrt starten. Die Bestzeit bleibt im Raum, bis er abläuft oder der Server neu startet.

## Hosting und Raum-Subdomains

Ein einzelner dauerhaft laufender Node-Prozess reicht. Der Port lässt sich mit `PORT` oder `npm start -- --port 8080` setzen. Mit normalem Hosting funktionieren Einladungen unter `/raum/CODE`.

Für echte Raum-Subdomains, z. B. `abc234.rally.example.com`:

1. Basisdomain und Wildcard im DNS zum selben Host leiten: `rally.example.com` und `*.rally.example.com`.
2. Einen HTTPS-Reverse-Proxy mit Zertifikat für beide Namen einrichten und alle Anfragen an dieselbe Node-Instanz weiterleiten.
3. Den Prozess mit `RALLY_DOMAIN=rally.example.com npm start` starten. Die App erzeugt dann Einladungen und Weiterleitungen auf den jeweiligen Raum-Host.

Räume, Sitzungen und Bestzeiten liegen im Arbeitsspeicher. Bei mehreren Instanzen müssten alle Anfragen eines Raums zum selben Prozess gehen. Reines statisches Hosting wie GitHub Pages führt den Spielserver nicht aus.

## Checks

```sh
npm test
```

Die Tests decken Fahrphysik, Zielkontrolle und den Austausch zwischen zwei Clients ab. Three.js ist lokal eingebunden; siehe [MIT-Lizenz](public/vendor/THREE-LICENSE.txt).
