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

### Deployment aus dem Git-Repo

Das Repo enthält einen **Node-Webserver**, der dauerhaft laufen muss. Das bloße Bereitstellen des Ordners `public` reicht nicht. Für ein Hosting-Panel gelten diese Einstellungen:

| Einstellung | Wert |
| --- | --- |
| Projektverzeichnis | Wurzel des Repos, dort liegt `package.json` |
| Runtime | Node.js 20 oder neuer; das Dockerfile verwendet Node.js 24 |
| Build | Kein Build-Schritt nötig, keine externen npm-Abhängigkeiten |
| Startbefehl | `npm start` oder `node server.js` |
| Interner Port / Zielport des Proxys | `8080`, sofern der Hoster keinen anderen `PORT` vorgibt |
| Bind-Adresse | Standardmäßig `0.0.0.0`; im Container so belassen |
| Verbindung Proxy → App | **HTTP**, TLS/HTTPS übernimmt der Proxy |
| Healthcheck | `GET /healthz` oder `HEAD /healthz`, erwartet HTTP 200 |
| Instanzen | Eine Instanz, da Räume im Arbeitsspeicher liegen |
| `RALLY_DOMAIN` | Zunächst weglassen; nur für eingerichtete Wildcard-Subdomains nötig |

Der interne Zielport im Hosting-Panel muss dem tatsächlich verwendeten `PORT` entsprechen. `--port` hat Vorrang vor `PORT`. Ein leeres `PORT` verwendet `8080`; `0` ist nur für lokale Tests gedacht und wählt einen zufälligen Port. Im Start-Log steht die tatsächliche Bind-Adresse mit Port. Eine normale HTTPS-Domain funktioniert auch ohne `RALLY_DOMAIN` mit Einladungen unter `/raum/CODE`.

Beim Docker-Deployment kann das vorhandene `Dockerfile` direkt gebaut werden. `EXPOSE 8080` dokumentiert den Containerport, veröffentlicht ihn aber nicht automatisch ([Docker-Dokumentation](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/)). Beispiel für einen Reverse-Proxy, der direkt auf demselben Server läuft:

```sh
docker build -t blind-rally .
docker run -d --name blind-rally --restart unless-stopped -p 127.0.0.1:8080:8080 blind-rally
```

Läuft auch der Proxy in einem Container, müssen beide Container ein gemeinsames Docker-Netzwerk nutzen; sein Ziel ist dann `http://blind-rally:8080`, nicht `localhost`. Die Portfreigabe auf `127.0.0.1` oben gilt für einen Proxy auf dem Host.

### HTTP 502 eingrenzen

HTTP 502 bedeutet, dass ein Gateway/Proxy keine gültige Antwort vom dahinterliegenden Server erhalten hat ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/502)). Ohne Deployment- und Proxy-Logs lässt sich die konkrete Ursache nicht bestimmen.

1. **Start-Log prüfen:** Erscheint `Blind Rally: http://0.0.0.0:8080` (bzw. der konfigurierte Port)? Falls nicht, zuerst den gemeldeten Startfehler beheben. `EADDRINUSE` heißt, der Port ist belegt; `EACCES` heißt, der Prozess darf den Port nicht öffnen. Bei `ENOENT` fehlen Dateien im Deployment; das gesamte Repo inklusive `track.json` und `public/vendor` bereitstellen. Eine alte Node-Version oder eine ungültige `RALLY_DOMAIN` kann den Start ebenfalls abbrechen.
2. **App direkt prüfen:** Auf dem Server `curl -i http://127.0.0.1:8080/healthz` ausführen (Port ggf. anpassen). Erwartet: HTTP 200 und `{"status":"ok"}`. Bei Docker gilt diese Adresse nur mit der oben gezeigten Portfreigabe; aus einem Proxy-Container den App-Namen im gemeinsamen Netzwerk verwenden.
3. **Proxy prüfen:** Funktioniert die direkte Anfrage, die öffentliche Domain aber nicht, Zieladresse, Zielport und Protokoll im Proxy prüfen. Der Spielserver spricht HTTP. `https://…:8080` als internes Ziel ist falsch. Bei IPv4-Bindung `127.0.0.1` statt eines eventuell auf `::1` aufgelösten `localhost` verwenden.

Beispiel für den `location`-Block in einem vorhandenen Nginx-Domain-/TLS-Serverblock, wenn Node bzw. der veröffentlichte Docker-Port auf demselben Host läuft ([Nginx-Dokumentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)):

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Fahrmodell: Škoda Fabia RS Rally2

Als Vorlage dienen die [technischen Daten von Škoda Motorsport](https://www.skoda-motorsport.com/en/skoda-fabia-rs-rally2/): 1.230 kg Fahrzeug-Mindestmasse, 2.569 mm Radstand, 216 kW, 432 Nm, Allradantrieb, fünf sequenzielle Gänge und 300-mm-Bremsscheiben für Schotter. Die Simulation rechnet mit **1.390 kg inklusive Crew**, dem Mindestgewicht nach [FIA Appendix J, Art. 261](https://www.fia.com/system/files/documents/261_2026_wmsc_2025.12.10_jt-mr.pdf).

Die Antriebskraft folgt aus Motordrehmoment, Gangübersetzung, Wirkungsgrad und Reifenradius. Die Fußbremse wandelt das Reibmoment an den Scheiben in Bremskraft um. Für die Kurvenfahrt nutzen Browser und Server dasselbe [Einspurmodell](https://www.mathworks.com/help/vdynblks/ref/bicyclemodel.html) mit [Fiala-Seitenkraft](https://help.functionbay.com/2024/RecurDynHelp/Tire/Tire_ch02_s03_03.html), Radlastwechsel und Reibungskreis. Schaltpunkte, Übersetzungen, Bremsdruck, Reifenwerte und Lenkhilfe sind Modellannahmen. Die fünf Gänge schalten im Spiel automatisch.

Auf ebenem Schotter erreicht **das Modell** 0–100 km/h in rund 4,7 s, bremst aus 100 km/h in rund 46 m, erreicht rund 1,06 g Spitzenquerbeschleunigung beim Lenktest aus 60 km/h und läuft bis rund 197 km/h. Das sind Simulationsergebnisse, keine Messdaten des echten Fahrzeugs.

## Checks

```sh
npm test
```

Die Tests decken Fahrphysik, Zielkontrolle, den Austausch zwischen zwei Clients, Hosting/Healthchecks und die Behandlung von Verbindungsfehlern und abgelaufenen Sitzungen im Client ab. Three.js ist lokal eingebunden; siehe [MIT-Lizenz](public/vendor/THREE-LICENSE.txt).
