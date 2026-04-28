/*
 * Unfallatlas Karte – Rhein-Kreis Neuss 2022
 * Datenquelle: Open Data Rhein-Kreis-Neuss (OpenDataSoft)
 * Dataset: rhein-kreis-neuss-2022-unfallatlas (1.365 Einträge)
 *
 * ConfigData:
 * {
 *   "apiurl": "https://opendata.rhein-kreis-neuss.de/api/explore/v2.1/catalog/datasets/rhein-kreis-neuss-2022-unfallatlas/records"
 * }
 *
 * @param {Object} configdata
 * @param enclosingHtmlDivElement
 * @returns NULL
 */
function app(configdata = {}, enclosingHtmlDivElement) {
  const BASE_URL =
    configdata.apiurl ||
    "https://opendata.rhein-kreis-neuss.de/api/explore/v2.1/catalog/datasets/rhein-kreis-neuss-2022-unfallatlas/records";

  enclosingHtmlDivElement.innerHTML = `
    <div style="background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.1);
                padding:.625rem 0 .75rem;margin-bottom:.75rem;overflow:hidden;">
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

  loadLeaflet().then(() => initMap(enclosingHtmlDivElement, BASE_URL));
  return null;
}

/* ── Leaflet dynamisch laden ── */
function loadLeaflet() {
  return new Promise((resolve) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    if (typeof L !== "undefined") {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve();
    script.onerror = () =>
      console.error("Leaflet konnte nicht geladen werden.");
    document.head.appendChild(script);
  });
}

/* ── Karte und Logik initialisieren ── */
function initMap(el, BASE_URL) {
  const map = L.map("unfall-map").setView([51.198, 6.687], 11);
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

  /* ── HTML-Escaping gegen XSS ── */
  function esc(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    markerGroup.clearLayers();
    markers = new Map();
    unfaelle.forEach((u, i) => {
      const coord = u.geo_point_2d;
      if (!coord || !coord.lat || !coord.lon) return;
      const marker = L.marker([coord.lat, coord.lon], { icon: makeIcon(u) });
      const color = kategorieColor(u.ukategorie);
      marker.bindPopup(
        `<div class="fw-bold mb-1" style="color:${color}">${esc(u.ukategorie) || "–"}</div>
         <div class="text-muted small mb-2">${esc(u.kommune)} &bull; ${esc(u.uwochentag)}, ${u.ustunde ? esc(u.ustunde) + ":00 Uhr" : ""}</div>
         <table class="table table-sm table-borderless mb-1">
           <tr><td class="text-muted">Unfallart</td><td>${esc(u.uart) || "–"}</td></tr>
           <tr><td class="text-muted">Unfalltyp</td><td>${esc(u.utyp1) || "–"}</td></tr>
           <tr><td class="text-muted">Licht</td><td>${esc(u.ulichtverh) || "–"}</td></tr>
           <tr><td class="text-muted">Monat</td><td>${u.umonat ? MONATE[parseInt(u.umonat)] || "Monat " + esc(u.umonat) : "–"}</td></tr>
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
            <div class="text-muted" style="font-size:0.72rem;">Mit Getöteten</div>
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 text-center py-2 py-md-3 h-100" style="background:#fff7ed">
            <div class="fs-4 fw-bold" style="color:#ea580c">${schwer}</div>
            <div class="text-muted" style="font-size:0.72rem;">Schwerverletzte</div>
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 text-center py-2 py-md-3 h-100" style="background:#fefce8">
            <div class="fs-4 fw-bold" style="color:#ca8a04">${leicht}</div>
            <div class="text-muted" style="font-size:0.72rem;">Leichtverletzte</div>
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 bg-light text-center py-2 py-md-3 h-100">
            <div class="fs-4 fw-bold text-success">${radUnf}</div>
            <div class="text-muted" style="font-size:0.72rem;">&#128690; Fahrrad</div>
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 bg-light text-center py-2 py-md-3 h-100">
            <div class="fs-4 fw-bold text-primary">${fussUnf}</div>
            <div class="text-muted" style="font-size:0.72rem;">&#128694; Fußgänger</div>
          </div>
        </div>
        <div class="col-4 col-md-2">
          <div class="card border-0 bg-light text-center py-2 py-md-3 h-100">
            <div class="fs-4 fw-bold text-dark">${topStunde ? topStunde[0] + ":00" : "–"}</div>
            <div class="text-muted" style="font-size:0.72rem;">Häuf. Stunde</div>
          </div>
        </div>
      </div>

      <h6 class="fw-semibold mb-2">Alle Unfälle (${unfaelle.length})</h6>
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
                          data-lat="${coord?.lat || ""}"
                          data-lon="${coord?.lon || ""}"
                          data-idx="${origIdx}">
                <td class="fw-semibold" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.kommune) || "–"}</td>
                <td><span class="badge" style="background:${color}">${esc(u.ukategorie) || "–"}</span></td>
                <td class="text-muted small" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.uart) || "–"}</td>
                <td class="text-muted small">${esc(u.ulichtverh) || "–"}</td>
                <td class="text-muted small">${u.uwochentag ? esc(u.uwochentag.substring(0, 2)) + "." : "–"} ${u.ustunde ? esc(u.ustunde) + ":00" : ""}</td>
                <td>${getBeteiligte(u)}</td>
              </tr>`;
                })
                .join("");
            })()}
          </tbody>
        </table>
      </div>
    `;

    listEl.querySelectorAll("tbody tr").forEach((row) => {
      row.addEventListener("click", () => {
        const lat = parseFloat(row.dataset.lat);
        const lon = parseFloat(row.dataset.lon);
        const idx = parseInt(row.dataset.idx);
        if (!lat || !lon) return;
        map.setView([lat, lon], 17);
        markers.get(idx)?.marker.openPopup();
        document
          .getElementById("unfall-map")
          .scrollIntoView({ behavior: "smooth", block: "center" });
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
  async function fetchAllPages(where) {
    const PAGE_SIZE = 100;
    let offset = 0;
    let total = null;
    let allResults = [];
    const listEl = el.querySelector("#unfall-list");

    while (true) {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (where) params.set("where", where);
      const res = await fetch(`${BASE_URL}?${params.toString()}`);
      if (!res.ok) throw new Error("API-Fehler: " + res.status);
      const data = await res.json();
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

    fetchAllPages(where)
      .then((results) => {
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
        if (progressContainer) progressContainer.style.display = "none";
        listEl.innerHTML = `<div class="alert alert-danger"><strong>Fehler beim Laden:</strong> ${esc(err.message)}</div>`;
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
  const fsBtn = el.querySelector("#map-fullscreen-btn");
  const mapContainer = el.querySelector("#unfall-map-container");
  const mapDiv = el.querySelector("#unfall-map");
  if (fsBtn && mapContainer) {
    fsBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        mapContainer.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        mapDiv.style.height = "100%";
        mapDiv.style.borderRadius = "0";
        fsBtn.innerHTML = "&#x2715;";
        fsBtn.title = "Vollbild beenden";
      } else {
        mapDiv.style.height = "560px";
        mapDiv.style.borderRadius = "10px";
        fsBtn.innerHTML = "&#x26F6;";
        fsBtn.title = "Vollbildmodus ein/aus";
      }
      map.invalidateSize();
    });
  }
}

/*
 * addToHead – nicht benötigt, Leaflet wird dynamisch in loadLeaflet() geladen.
 */
function addToHead() {}
