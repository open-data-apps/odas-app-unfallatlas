/*
 * Unfallatlas Karte – Rhein-Kreis Neuss 2022
 * Datenquelle: Open Data Rhein-Kreis-Neuss (OpenDataSoft)
 * Dataset: rhein-kreis-neuss-2022-unfallatlas (1.365 Einträge)
 *
 * ConfigData:
 * {
 *   "apiurls": [
 *     { "name": "unfaelle", "label": "URL zu den Daten", "url": "https://opendata.rhein-kreis-neuss.de/api/explore/v2.1/catalog/datasets/rhein-kreis-neuss-2022-unfallatlas/records" }
 *   ]
 * }
 *
 * @param {Object} configdata
 * @param enclosingHtmlDivElement
 * @returns NULL
 */
function isOdasProxyEnabled(configdata = {}) {
  return String(configdata.proxyAktiv || "").trim().toLowerCase() === "ja";
}

function extractPathFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname + parsedUrl.search;
  } catch (_error) {
    return String(url || "");
  }
}

function getOdasAppBasePath(pathname) {
  let appPath =
    pathname === undefined
      ? typeof window !== "undefined"
        ? window.location.pathname
        : "/"
      : String(pathname || "/");

  if (!appPath.endsWith("/")) {
    const lastSlashIndex = appPath.lastIndexOf("/");
    const lastSegment = appPath.substring(lastSlashIndex + 1);
    if (lastSegment.includes(".")) {
      appPath = appPath.substring(0, lastSlashIndex + 1);
    }
  }

  return appPath.replace(/\/+$/, "");
}

function getOdasProxyEndpoint(targetUrl, pathname) {
  const appPath = getOdasAppBasePath(pathname);
  return `${appPath}/odp-data?path=${encodeURIComponent(
    extractPathFromUrl(targetUrl),
  )}`;
}

async function fetchViaOdasProxy(targetUrl) {
  const response = await fetch(getOdasProxyEndpoint(targetUrl), {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`ODAS-Proxy-Fehler: HTTP ${response.status}`);
  }

  const proxyData = await response.json();
  if (!proxyData || typeof proxyData.content !== "string") {
    throw new Error("ODAS-Proxy-Antwort enthält keinen content-String.");
  }

  return proxyData.content;
}

async function fetchOdasResource(targetUrl, configdata = {}) {
  if (isOdasProxyEnabled(configdata)) {
    return fetchViaOdasProxy(targetUrl);
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    throw new Error(
      `Direkter Datenabruf fehlgeschlagen (${error.message}). Bitte prüfen Sie die Daten-URL und die CORS-Freigabe der Datenquelle.`,
    );
  }
}

/**
 * Löst eine benannte Datenressource aus configdata.apiurls auf.
 * Neue apiurls-Form (typ: "array"); das frühere skalare apiurl wird nicht mehr gelesen.
 * @returns {string} getrimmte URL, oder "" für den Zustand "keine Quelle konfiguriert"
 */
function getOdasApiUrl(configdata, name) {
  const liste = Array.isArray(configdata && configdata.apiurls) ? configdata.apiurls : [];
  const treffer = liste.find((eintrag) => eintrag && eintrag.name === name);
  return String((treffer && treffer.url) || "").trim();
}

async function fetchOdasJson(targetUrl, configdata = {}) {
  const rawContent = await fetchOdasResource(targetUrl, configdata);
  try {
    return JSON.parse(rawContent);
  } catch (_error) {
    throw new Error(
      `Die konfigurierte Daten-URL liefert kein JSON, sondern ${describeNonJsonPayload(rawContent)}. ` +
        "Bitte in der Instanzkonfiguration den API-Endpunkt der Datenquelle eintragen, " +
        "nicht den Datensatz- oder Download-Link.",
    );
  }
}

function describeNonJsonPayload(rawContent) {
  const text = String(rawContent == null ? "" : rawContent).trim();
  if (!text) return "eine leere Antwort";
  if (text.startsWith("<")) return "eine HTML-Seite";
  const firstLine = text.split(/\r?\n/, 1)[0];
  if (/[,;]/.test(firstLine)) return "eine CSV- oder Textdatei";
  return "unlesbaren Inhalt";
}

let uaInstanzZaehler = 0;
const uaCleanups = new WeakMap();
let leafletLoadPromise = null;

function app(configdata = {}, enclosingHtmlDivElement) {
  const uaUid = "i" + ++uaInstanzZaehler;
  const previousCleanup = uaCleanups.get(enclosingHtmlDivElement);
  if (previousCleanup) previousCleanup();

  const quelle = getOdasApiUrl(configdata, "unfaelle");
  if (!quelle || /^\{\{.*\}\}$/.test(quelle) || /^<.*>$/.test(quelle)) {
    enclosingHtmlDivElement.innerHTML =
      '<div class="alert alert-info" role="alert">Es ist keine Datenquelle konfiguriert.</div>';
    return null;
  }

  const BASE_URL = getOdasApiUrl(configdata, "unfaelle");

  let disposed = false;
  let mapCleanup = null;

  function cleanup() {
    if (disposed) return;
    disposed = true;
    window.removeEventListener("hashchange", handleAppHashChange);
    if (mapCleanup) {
      mapCleanup();
      mapCleanup = null;
    }
    if (uaCleanups.get(enclosingHtmlDivElement) === cleanup) {
      uaCleanups.delete(enclosingHtmlDivElement);
    }
  }

  function handleAppHashChange() {
    if (window.location.hash !== "#startseite") cleanup();
  }

  uaCleanups.set(enclosingHtmlDivElement, cleanup);
  window.addEventListener("hashchange", handleAppHashChange);

  enclosingHtmlDivElement.innerHTML = `
    <div style="background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.1);
                padding:.625rem 0 .75rem;margin-bottom:.75rem;overflow:hidden;">
      <div class="text-end px-3 mb-1"><small id="ua-datenstand" class="text-muted"></small></div>
      <div class="row g-2 align-items-end justify-content-center mx-0 px-2">

          <div class="col-12 col-md-4">
            <label class="form-label fw-semibold mb-1 small">&#128205; Kommune suchen</label>
            <div class="input-group input-group-sm">
              <input type="text" id="kommune-input" class="form-control"
                placeholder="z. B. Neuss oder Kaarst" />
              <button class="btn btn-danger" id="suche-btn">Suchen</button>
              <button class="btn btn-outline-secondary" id="alle-btn" title="Alle Filter zurücksetzen">&#x21BA; Alle</button>
            </div>
          </div>

          <div class="col-4 col-md-2">
            <label class="form-label fw-semibold mb-1 small">&#128657; Schwere</label>
            <select id="filter-kategorie" class="form-select form-select-sm">
              <option value="">Alle</option>
              <option value="Unfall mit Getöteten">Mit Getöteten</option>
              <option value="Unfall mit Schwerverletzten">Schwerverletzte</option>
              <option value="Unfall mit Leichtverletzten">Leichtverletzte</option>
            </select>
          </div>

          <div class="col-4 col-md-2">
            <label class="form-label fw-semibold mb-1 small">&#128690; Beteiligt</label>
            <select id="filter-beteiligt" class="form-select form-select-sm">
              <option value="">Alle</option>
              <option value="istrad">Fahrrad</option>
              <option value="istfuss">Fußgänger</option>
              <option value="istkrad">Motorrad</option>
              <option value="istpkw">PKW</option>
              <option value="istgkfz">LKW</option>
            </select>
          </div>

          <div class="col-4 col-md-2">
            <label class="form-label fw-semibold mb-1 small">&#127759; Licht</label>
            <select id="filter-licht" class="form-select form-select-sm">
              <option value="">Alle</option>
              <option value="Tageslicht">Tageslicht</option>
              <option value="Dämmerung">Dämmerung</option>
              <option value="Dunkelheit">Dunkelheit</option>
            </select>
          </div>

          <div class="col-12 col-md-2 d-flex align-items-end pb-1">
            <div id="treffer-badge"></div>
          </div>

      </div>
    </div>

    <div id="unfall-map-container" style="position:relative; margin-bottom:1rem;">
      <div id="unfall-map" style="height:560px; border-radius:10px; overflow:hidden; z-index:0;"></div>
      <button id="map-fullscreen-btn" title="Vollbildmodus ein/aus"
        style="position:absolute;top:10px;right:10px;z-index:999;background:#fff;border:2px solid rgba(0,0,0,.25);
               border-radius:4px;width:34px;height:34px;font-size:17px;cursor:pointer;
               display:flex;align-items:center;justify-content:center;line-height:1;">&#x26F6;</button>
      <div id="lade-progress-container"
           style="position:absolute;bottom:0;left:0;right:0;z-index:998;display:none;
                  border-radius:0 0 10px 10px;overflow:hidden;pointer-events:none;">
        <div style="background:rgba(255,255,255,0.93);backdrop-filter:blur(4px);padding:6px 14px 8px;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <small id="lade-progress-text" class="text-muted">Lade Daten…</small>
            <small id="lade-progress-pct" class="text-danger fw-semibold"></small>
          </div>
          <div class="progress" style="height:4px;border-radius:2px;">
            <div id="lade-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated bg-danger"
                 role="progressbar" style="width:0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
          </div>
        </div>
      </div>
    </div>

    <div id="unfall-list">
      <div class="text-center py-5 text-muted">
        <div style="font-size:2.5rem;">&#128657;</div>
        <p class="mt-2">Klicke auf <strong>&#x21BA; Alle</strong> oder suche nach einer Kommune.</p>
      </div>
    </div>
  `;

  loadLeaflet()
    .then(() => {
      if (
        disposed ||
        !enclosingHtmlDivElement.querySelector("#unfall-map")
      ) {
        return;
      }
      mapCleanup = initMap(enclosingHtmlDivElement, BASE_URL, configdata, uaUid);
    })
    .catch((error) => {
      if (disposed) return;
      console.error(error.message);
      const mapContainer = enclosingHtmlDivElement.querySelector("#unfall-map");
      if (mapContainer) {
        mapContainer.innerHTML = `<div class="alert alert-danger m-3" role="alert">Kartenbibliothek konnte nicht geladen werden (${escapeHtml(error.message)}). Prüfen Sie die Internetverbindung.</div>`;
      }
    });
  return null;
}

/* ── Leaflet dynamisch laden ── */
function loadLeaflet() {
  if (!document.getElementById("leaflet-css")) {
    const link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = "vendor/leaflet/leaflet.css";
    document.head.appendChild(link);
  }
  if (typeof L !== "undefined") return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "leaflet-js";
    script.src = "vendor/leaflet/leaflet.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Leaflet konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
  return leafletLoadPromise;
}

/* ── Karte und Logik initialisieren ── */
function initMap(el, BASE_URL, configdata, uid) {
  const mapDiv = el.querySelector("#unfall-map");
  const mapContainer = el.querySelector("#unfall-map-container");
  const fsBtn = el.querySelector("#map-fullscreen-btn");
  let destroyed = false;
  // Monotoner Lade-Token: schuetzt gegen Ueberholung einer aelteren Anfrage
  // durch eine neuere (z.B. schneller Doppel-Filterwechsel) — zusaetzlich
  // zum destroyed-Flag, das nur das Seitenverlassen abdeckt (F-70).
  let requestToken = 0;

  const map = L.map(mapDiv).setView([51.198, 6.687], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Daten: Statistische Ämter / Open Data Rhein-Kreis-Neuss (CC BY 4.0)',
    maxZoom: 19,
  }).addTo(map);

  const markerGroup = L.layerGroup().addTo(map);
  const dataCache = new Map();
  let alleUnfaelle = [];
  let markers = new Map();
  let sortColumn = null;
  let sortDir = 1;
  let currentGefiltert = [];

  const MONATE = [
    "",
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ];

  /* ── Farbe nach Schwere ── */
  function kategorieColor(kat) {
    if (!kat) return "#6b7280";
    if (kat.includes("Getötet")) return "#991b1b";
    if (kat.includes("Schwerverlet")) return "#ea580c";
    return "#ca8a04";
  }

  /* ── Icon ── */
  function makeIcon(unfall) {
    const color = kategorieColor(unfall.ukategorie);
    return L.divIcon({
      className: "",
      html: `<div style="background:${color};border:2px solid #fff;border-radius:50%;width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -10],
    });
  }

  /* ── Beteiligte als Badges ── */
  function getBeteiligte(u) {
    const liste = [];
    if (u.istrad === "1")
      liste.push('<span class="badge bg-success">&#128690; Fahrrad</span>');
    if (u.istfuss === "1")
      liste.push('<span class="badge bg-primary">&#128694; Fußgänger</span>');
    if (u.istkrad === "1")
      liste.push(
        '<span class="badge bg-warning text-dark">&#127949; Motorrad</span>',
      );
    if (u.istpkw === "1")
      liste.push('<span class="badge bg-secondary">&#128663; PKW</span>');
    if (u.istgkfz === "1")
      liste.push('<span class="badge bg-dark">&#128666; LKW</span>');
    return liste.join(" ") || "–";
  }

  /* ── Sortier-Hilfsfunktionen ── */
  function sortIcon(col) {
    if (sortColumn !== col)
      return '<span style="opacity:0.3;font-size:0.75em;">⇅</span>';
    return sortDir === 1
      ? ' <span style="font-size:0.85em;">↑</span>'
      : ' <span style="font-size:0.85em;">↓</span>';
  }

  function sortUnfaelle(unfaelle) {
    if (!sortColumn) return unfaelle;
    return [...unfaelle].sort((a, b) => {
      const va = a[sortColumn] ?? "";
      const vb = b[sortColumn] ?? "";
      if (sortColumn === "ustunde") {
        return ((parseInt(va) || 0) - (parseInt(vb) || 0)) * sortDir;
      }
      return String(va).localeCompare(String(vb), "de") * sortDir;
    });
  }

  /* ── Marker rendern ── */
  function renderMarkers(unfaelle) {
    if (destroyed) return;
    markerGroup.clearLayers();
    markers = new Map();
    unfaelle.forEach((u, i) => {
      const coord = u.geo_point_2d;
      if (!coord || !coord.lat || !coord.lon) return;
      const marker = L.marker([coord.lat, coord.lon], { icon: makeIcon(u) });
      const color = kategorieColor(u.ukategorie);
      marker.bindPopup(
        `<div class="fw-bold mb-1" style="color:${color}">${escapeHtml(u.ukategorie) || "–"}</div>
         <div class="text-muted small mb-2">${escapeHtml(u.kommune)} &bull; ${escapeHtml(u.uwochentag)}, ${u.ustunde ? escapeHtml(u.ustunde) + ":00 Uhr" : ""}</div>
         <table class="table table-sm table-borderless mb-1">
           <tr><td class="text-muted">Unfallart</td><td>${escapeHtml(u.uart) || "–"}</td></tr>
           <tr><td class="text-muted">Unfalltyp</td><td>${escapeHtml(u.utyp1) || "–"}</td></tr>
           <tr><td class="text-muted">Licht</td><td>${escapeHtml(u.ulichtverh) || "–"}</td></tr>
           <tr><td class="text-muted">Monat</td><td>${u.umonat ? MONATE[parseInt(u.umonat)] || "Monat " + escapeHtml(u.umonat) : "–"}</td></tr>
         </table>
         <div class="mt-1">${getBeteiligte(u)}</div>`,
        { maxWidth: 300 },
      );
      markerGroup.addLayer(marker);
      markers.set(i, { marker, unfall: u });
    });
    if (unfaelle.length > 0) {
      const coords = unfaelle
        .filter((u) => u.geo_point_2d?.lat && u.geo_point_2d?.lon)
        .map((u) => [u.geo_point_2d.lat, u.geo_point_2d.lon]);
      if (coords.length > 0)
        map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
    }
  }

  /* ── Statistik & Tabelle rendern ── */
  function renderListe(unfaelle) {
    if (destroyed) return;
    currentGefiltert = unfaelle;
    const sorted = sortUnfaelle(unfaelle);
    const listEl = el.querySelector("#unfall-list");
    if (unfaelle.length === 0) {
      listEl.innerHTML = `<div class="alert alert-warning">Keine Unfälle gefunden.</div>`;
      return;
    }

    const getoetet = unfaelle.filter((u) =>
      u.ukategorie?.includes("Getötet"),
    ).length;
    const schwer = unfaelle.filter((u) =>
      u.ukategorie?.includes("Schwerverlet"),
    ).length;
    const leicht = unfaelle.filter((u) =>
      u.ukategorie?.includes("Leichtverlet"),
    ).length;
    const radUnf = unfaelle.filter((u) => u.istrad === "1").length;
    const fussUnf = unfaelle.filter((u) => u.istfuss === "1").length;

    const stundenMap = {};
    unfaelle.forEach((u) => {
      if (u.ustunde) stundenMap[u.ustunde] = (stundenMap[u.ustunde] || 0) + 1;
    });
    const topStunde = Object.entries(stundenMap).sort((a, b) => b[1] - a[1])[0];

    listEl.innerHTML = `
      <div class="row g-2 mb-4">
        <div class="col-4 col-md-2">
          <div class="card border-0 text-center py-2 py-md-3 h-100" style="background:#fef2f2">
            <div class="fs-4 fw-bold" style="color:#991b1b">${getoetet}</div>
            <div class="text-muted" style="font-size:0.72rem;">Mit Getöteten</div>${kpiContext(configdata.kpiKontext1, "1", uid)}
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 text-center py-2 py-md-3 h-100" style="background:#fff7ed">
            <div class="fs-4 fw-bold" style="color:#ea580c">${schwer}</div>
            <div class="text-muted" style="font-size:0.72rem;">Schwerverletzte</div>${kpiContext(configdata.kpiKontext2, "2", uid)}
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 text-center py-2 py-md-3 h-100" style="background:#fefce8">
            <div class="fs-4 fw-bold" style="color:#ca8a04">${leicht}</div>
            <div class="text-muted" style="font-size:0.72rem;">Leichtverletzte</div>${kpiContext(configdata.kpiKontext3, "3", uid)}
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 bg-light text-center py-2 py-md-3 h-100">
            <div class="fs-4 fw-bold text-success">${radUnf}</div>
            <div class="text-muted" style="font-size:0.72rem;">&#128690; Fahrrad</div>${kpiContext(configdata.kpiKontext4, "4", uid)}
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 bg-light text-center py-2 py-md-3 h-100">
            <div class="fs-4 fw-bold text-primary">${fussUnf}</div>
            <div class="text-muted" style="font-size:0.72rem;">&#128694; Fußgänger</div>${kpiContext(configdata.kpiKontext5, "5", uid)}
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 bg-light text-center py-2 py-md-3 h-100">
            <div class="fs-4 fw-bold text-dark">${topStunde ? escapeHtml(topStunde[0]) + ":00" : "–"}</div>
            <div class="text-muted" style="font-size:0.72rem;">Häuf. Stunde</div>${kpiContext(configdata.kpiKontext6, "6", uid)}
          </div>
        </div>
      </div>

      <h6 class="fw-semibold mb-2">Alle Unfälle (${unfaelle.length})</h6>${kpiContext(configdata.kpiKontext7, "7", uid)}
      <div class="table-responsive" style="max-height:420px;">
        <table class="table table-hover table-sm align-middle mb-0">
          <thead class="table-light" style="position:sticky;top:0;z-index:1;">
            <tr>
              <th data-sort="kommune" style="cursor:pointer;user-select:none;white-space:nowrap;">Kommune ${sortIcon("kommune")}</th>
              <th data-sort="ukategorie" style="cursor:pointer;user-select:none;white-space:nowrap;">Schwere ${sortIcon("ukategorie")}</th>
              <th data-sort="uart" style="cursor:pointer;user-select:none;white-space:nowrap;">Unfallart ${sortIcon("uart")}</th>
              <th data-sort="ulichtverh" style="cursor:pointer;user-select:none;white-space:nowrap;">Licht ${sortIcon("ulichtverh")}</th>
              <th data-sort="ustunde" style="cursor:pointer;user-select:none;white-space:nowrap;">Zeit ${sortIcon("ustunde")}</th>
              <th>Beteiligte</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              const idxMap = new Map(unfaelle.map((u, i) => [u, i]));
              return sorted
                .map((u) => {
                  const origIdx = idxMap.get(u) ?? -1;
                  const coord = u.geo_point_2d;
                  const color = kategorieColor(u.ukategorie);
                  return `<tr style="cursor:${coord?.lat ? "pointer" : "default"}"
                          data-lat="${escapeHtml(coord?.lat || "")}"
                          data-lon="${escapeHtml(coord?.lon || "")}"
                          data-idx="${origIdx}">
                <td class="fw-semibold" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.kommune) || "–"}</td>
                <td><span class="badge" style="background:${color}">${escapeHtml(u.ukategorie) || "–"}</span></td>
                <td class="text-muted small" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(u.uart) || "–"}</td>
                <td class="text-muted small">${escapeHtml(u.ulichtverh) || "–"}</td>
                <td class="text-muted small">${u.uwochentag ? escapeHtml(u.uwochentag.substring(0, 2)) + "." : "–"} ${u.ustunde ? escapeHtml(u.ustunde) + ":00" : ""}</td>
                <td>${getBeteiligte(u)}</td>
              </tr>`;
                })
                .join("");
            })()}
          </tbody>
        </table>
      </div>
      ${renderWeitereInfos(configdata, uid)}
      ${renderMethodikbox(configdata, uid)}
    `;

    listEl.querySelectorAll("tbody tr").forEach((row) => {
      row.addEventListener("click", () => {
        if (destroyed) return;
        const lat = parseFloat(row.dataset.lat);
        const lon = parseFloat(row.dataset.lon);
        const idx = parseInt(row.dataset.idx);
        if (!lat || !lon) return;
        map.setView([lat, lon], 17);
        markers.get(idx)?.marker.openPopup();
        mapDiv.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    listEl.querySelectorAll("thead th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (sortColumn === col) sortDir *= -1;
        else {
          sortColumn = col;
          sortDir = 1;
        }
        renderListe(currentGefiltert);
      });
    });
  }

  /* ── Treffer-Badge ── */
  function updateBadge(n) {
    if (destroyed) return;
    const badge = el.querySelector("#treffer-badge");
    if (!badge) return;
    badge.innerHTML =
      n === null ? "" : `<span class="badge bg-danger">${n} Treffer</span>`;
  }

  /* ── Client-seitiger Filter (Beteiligt + Licht) ── */
  function applyClientFilter(unfaelle, beteiligtFilter, lichtFilter) {
    let result = unfaelle;
    if (beteiligtFilter) {
      result = result.filter((u) => u[beteiligtFilter] === "1");
    }
    if (lichtFilter) {
      result = result.filter((u) => u.ulichtverh === lichtFilter);
    }
    return result;
  }

  /* ── Alle Seiten laden (Pagination) ── */
  async function fetchAllPages(where, token) {
    const PAGE_SIZE = 100;
    let offset = 0;
    let total = null;
    let allResults = [];
    const listEl = el.querySelector("#unfall-list");

    /* ── Schale 4: Catalog-Metadaten laden ── */
    var catalogUrl = BASE_URL.replace(/\/records$/, "").replace(/\/api\/explore\/v2\.\d\/catalog\/datasets\//, function(m) {
      return m;
    });
    if (!catalogUrl.endsWith("/")) catalogUrl += "/";
    var datasetId = BASE_URL.split("/catalog/datasets/")[1]?.split("/")[0] || "";
    if (datasetId) {
      var catUrl = BASE_URL.substring(0, BASE_URL.indexOf("/catalog/datasets/")) + "/catalog/datasets/" + datasetId;
      fetchOdasJson(catUrl, configdata).then(function(meta) {
        if (destroyed || token !== requestToken) return;
        var stand = extractDatenStand(meta);
        if (stand) {
          var badge = el.querySelector("#ua-datenstand");
          if (badge) badge.textContent = "Aktualisiert: " + stand;
        }
      }).catch(function() {});
    }

    while (true) {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (where) params.set("where", where);
      const data = await fetchOdasJson(
        `${BASE_URL}?${params.toString()}`,
        configdata,
      );
      if (destroyed || token !== requestToken) return allResults;
      if (total === null) total = data.total_count || 0;
      const page = data.results || [];
      allResults = allResults.concat(page);
      if (total > 0) {
        const pct = Math.min(
          100,
          Math.round((allResults.length / total) * 100),
        );
        const bar = el.querySelector("#lade-progress-bar");
        const txt = el.querySelector("#lade-progress-text");
        const pctEl = el.querySelector("#lade-progress-pct");
        if (bar) {
          bar.style.width = pct + "%";
          bar.setAttribute("aria-valuenow", String(pct));
        }
        if (txt) txt.textContent = `Lade… ${allResults.length} / ${total}`;
        if (pctEl) pctEl.textContent = pct + "%";
      }
      if (page.length < PAGE_SIZE || allResults.length >= total) break;
      offset += PAGE_SIZE;
    }
    return allResults;
  }

  /* ── Hauptfunktion: Daten laden + filtern + rendern ── */
  function fetchUnfaelle(
    kommuneInput,
    kategorieFilter,
    beteiligtFilter,
    lichtFilter,
  ) {
    if (destroyed) return;
    // Neuer Lade-Zyklus: entwertet jede noch laufende aeltere Anfrage.
    const myToken = ++requestToken;
    const listEl = el.querySelector("#unfall-list");
    listEl.innerHTML = "";
    markerGroup.clearLayers();
    markers = new Map();
    updateBadge(null);
    const progressContainer = el.querySelector("#lade-progress-container");
    const progressBar = el.querySelector("#lade-progress-bar");
    const progressText = el.querySelector("#lade-progress-text");
    if (progressContainer) {
      progressContainer.style.display = "block";
      progressBar.style.width = "0%";
      progressBar.setAttribute("aria-valuenow", "0");
      progressText.textContent = "Lade Daten…";
    }

    const conditions = [];
    if (kommuneInput) {
      const safeKommune = kommuneInput.replace(/'/g, "''");
      conditions.push(`kommune LIKE '%${safeKommune}%'`);
    }
    if (kategorieFilter) {
      const safeKategorie = kategorieFilter.replace(/'/g, "''");
      conditions.push(`ukategorie = '${safeKategorie}'`);
    }
    const where = conditions.length > 0 ? conditions.join(" AND ") : null;

    const cacheKey = where || "__alle__";
    if (dataCache.has(cacheKey)) {
      if (progressContainer) progressContainer.style.display = "none";
      alleUnfaelle = dataCache.get(cacheKey);
      const gefiltert = applyClientFilter(
        alleUnfaelle,
        beteiligtFilter,
        lichtFilter,
      );
      updateBadge(gefiltert.length);
      renderMarkers(gefiltert);
      renderListe(gefiltert);
      return;
    }

    fetchAllPages(where, myToken)
      .then((results) => {
        if (destroyed || myToken !== requestToken) return;
        if (progressContainer) progressContainer.style.display = "none";
        dataCache.set(cacheKey, results);
        alleUnfaelle = results;
        const gefiltert = applyClientFilter(
          alleUnfaelle,
          beteiligtFilter,
          lichtFilter,
        );
        updateBadge(gefiltert.length);
        renderMarkers(gefiltert);
        renderListe(gefiltert);
      })
      .catch((err) => {
        if (destroyed || myToken !== requestToken) return;
        if (progressContainer) progressContainer.style.display = "none";
        listEl.innerHTML = `<div class="alert alert-danger"><strong>Fehler beim Laden:</strong> ${escapeHtml(err.message)}</div>`;
        updateBadge(0);
      });
  }

  /* ── Event-Handler ── */
  const sucheBtn = el.querySelector("#suche-btn");
  const alleBtn = el.querySelector("#alle-btn");
  const kommuneInput = el.querySelector("#kommune-input");
  const filterKat = el.querySelector("#filter-kategorie");
  const filterBet = el.querySelector("#filter-beteiligt");
  const filterLicht = el.querySelector("#filter-licht");

  function triggerSuche() {
    fetchUnfaelle(
      kommuneInput.value.trim(),
      filterKat.value,
      filterBet.value,
      filterLicht.value,
    );
  }

  sucheBtn.addEventListener("click", triggerSuche);
  kommuneInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerSuche();
  });

  alleBtn.addEventListener("click", () => {
    kommuneInput.value = "";
    filterKat.value = "";
    filterBet.value = "";
    filterLicht.value = "";
    fetchUnfaelle("", "", "", "");
  });

  // Kategorie → neuer API-Call (serverseitig filterbar)
  filterKat.addEventListener("change", () => {
    fetchUnfaelle(
      kommuneInput.value.trim(),
      filterKat.value,
      filterBet.value,
      filterLicht.value,
    );
  });

  // Beteiligt + Licht → clientseitig auf bereits geladenem Datensatz
  filterBet.addEventListener("change", () => {
    if (alleUnfaelle.length > 0) {
      const gefiltert = applyClientFilter(
        alleUnfaelle,
        filterBet.value,
        filterLicht.value,
      );
      updateBadge(gefiltert.length);
      renderMarkers(gefiltert);
      renderListe(gefiltert);
    }
  });

  filterLicht.addEventListener("change", () => {
    if (alleUnfaelle.length > 0) {
      const gefiltert = applyClientFilter(
        alleUnfaelle,
        filterBet.value,
        filterLicht.value,
      );
      updateBadge(gefiltert.length);
      renderMarkers(gefiltert);
      renderListe(gefiltert);
    }
  });

  /* ── Vollbild-Button ── */
  function handleFullscreenClick() {
    if (destroyed) return;
    if (mapContainer && document.fullscreenElement === mapContainer) {
      document.exitFullscreen?.();
    } else if (!document.fullscreenElement) {
      mapContainer.requestFullscreen?.();
    }
  }

  function handleFullscreenChange() {
    if (destroyed) return;
    const isMapFullscreen = document.fullscreenElement === mapContainer;
    mapDiv.style.height = isMapFullscreen ? "100%" : "560px";
    mapDiv.style.borderRadius = isMapFullscreen ? "0" : "10px";
    fsBtn.innerHTML = isMapFullscreen ? "&#x2715;" : "&#x26F6;";
    fsBtn.title = isMapFullscreen
      ? "Vollbild beenden"
      : "Vollbildmodus ein/aus";
    map.invalidateSize();
  }

  if (fsBtn && mapContainer) {
    fsBtn.addEventListener("click", handleFullscreenClick);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
  }

  return function cleanupMap() {
    if (destroyed) return;
    destroyed = true;
    if (fsBtn) fsBtn.removeEventListener("click", handleFullscreenClick);
    document.removeEventListener("fullscreenchange", handleFullscreenChange);
    if (mapContainer && document.fullscreenElement === mapContainer) {
      const exitPromise = document.exitFullscreen?.();
      if (exitPromise?.catch) exitPromise.catch(() => {});
    }
    map.remove();
  };
}

/* ── Schale 4: escapeHtml ── */
function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ── Schale 4: Weiterführende Links ── */
function renderWeitereInfos(cfg, uid) {
  var links = ((cfg && cfg.weiterfuehrendeLinks) || "").trim();
  if (!links) return "";
  return (
    '<section class="ua-weitere-infos mt-3">' +
    '<h2 class="h5 mb-2">Weitere Informationen</h2>' +
    '<div class="ua-weitere-infos-content">' +
    links +
    "</div></section>"
  );
}

/* ── Schale 4: Datenfrische aus ODS Catalog ── */
function extractDatenStand(responseData) {
  var modified = responseData?.metas?.modified || null;
  if (!modified) return null;
  var d = new Date(modified);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE");
}

/* ── Schale 4: KPI-Kontext ── */
function kpiContext(kontext, id, uid) {
  var text = String(kontext || "").trim();
  if (!text) return "";
  var targetId = "ua-kpi-kontext-" + id + "-" + uid;
  return (
    '<button class="ua-kpi-info-toggle collapsed" type="button" ' +
    'data-bs-toggle="collapse" data-bs-target="#' + targetId + '" ' +
    'aria-expanded="false" aria-controls="' + targetId + '" ' +
    'aria-label="Erklärung zu diesem Wert">' +
    '<span class="ua-kpi-info-icon" aria-hidden="true">ⓘ</span>' +
    "</button>" +
    '<div id="' + targetId + '" class="collapse">' +
    '<div class="ua-kpi-kontext">' + escapeHtml(text) + "</div>" +
    "</div>"
  );
}

/* ── Schale 4: Methodikbox ── */
function renderMethodikbox(cfg, uid) {
  var hinweis = ((cfg && cfg.datenquelleHinweis) || "").trim();
  var stand = ((cfg && cfg.datenStand) || "").trim();
  if (!hinweis && !stand) return "";
  var standHtml = stand
    ? '<p class="text-muted small mb-2">' + escapeHtml(stand) + "</p>"
    : "";
  return (
    '<section class="ua-methodik mt-3">' +
    '<button class="ua-methodik-toggle collapsed" type="button" ' +
    'data-bs-toggle="collapse" data-bs-target="#ua-methodik-body-' + uid + '" ' +
    'aria-expanded="false" aria-controls="ua-methodik-body-' + uid + '">' +
    '<h2 class="h5 mb-0">Methodik &amp; Datenquelle</h2>' +
    '<span class="ua-methodik-chevron" aria-hidden="true">&#9662;</span>' +
    "</button>" +
    '<div id="ua-methodik-body-' + uid + '" class="collapse">' +
    '<div class="ua-methodik-content">' +
    standHtml +
    hinweis +
    "</div></div></section>"
  );
}

/*
 * addToHead – nicht benötigt, Leaflet wird dynamisch in loadLeaflet() geladen.
 */
function addToHead() {}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isOdasProxyEnabled,
    extractPathFromUrl,
    getOdasAppBasePath,
    getOdasProxyEndpoint,
    fetchViaOdasProxy,
    fetchOdasResource,
    fetchOdasJson,
  };
}
