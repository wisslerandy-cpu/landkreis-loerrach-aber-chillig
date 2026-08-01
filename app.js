(function () {
  "use strict";

  const state = {
    wer: null,
    stimmung: null,
    suche: "",
    daten: [],
  };

  let searchActive = false;

  const werChips = document.getElementById("wer-chips");
  const stimmungChips = document.getElementById("stimmung-chips");
  const ctaButton = document.getElementById("cta-button");
  const resetButton = document.getElementById("reset-button");
  const emptyResetButton = document.getElementById("empty-reset-button");
  const resultsSection = document.getElementById("results");
  const emptySection = document.getElementById("empty-state");
  const emptyText = document.getElementById("empty-text");
  const resultsTitle = document.getElementById("results-title");
  const stack = document.getElementById("stack");
  const searchInput = document.getElementById("search-input");

  const EMPTY_TEXT_PICKER = "Hm, dafür haben wir gerade noch nichts Passendes im Landkreis gefunden.";
  const EMPTY_TEXT_SUCHE = "Da war leider nichts dabei – versuch's mit einem anderen Suchbegriff!";

  const WER_LABELS = {
    alleine: "Alleine",
    zu_zweit: "Zu zweit",
    hund: "Mit Hund",
    "18_25": "18–25",
  };

  fetch("daten.json")
    .then((r) => r.json())
    .then((data) => {
      state.daten = data.eintraege || [];
      buildStimmungChips(state.daten);
    })
    .catch(() => {
      state.daten = [];
    });

  function buildStimmungChips(eintraege) {
    const alle = new Set();
    eintraege.forEach((e) => (e.stimmung || []).forEach((s) => alle.add(s)));
    stimmungChips.innerHTML = "";
    Array.from(alle)
      .sort()
      .forEach((s) => {
        const btn = document.createElement("button");
        btn.className = "chip";
        btn.dataset.group = "stimmung";
        btn.dataset.value = s;
        btn.textContent = s.charAt(0).toUpperCase() + s.slice(1);
        stimmungChips.appendChild(btn);
      });
    attachChipHandlers();
  }

  function attachChipHandlers() {
    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const group = chip.dataset.group;
        const value = chip.dataset.value;
        const isActive = chip.classList.contains("is-active");

        document
          .querySelectorAll('.chip[data-group="' + group + '"]')
          .forEach((c) => c.classList.remove("is-active"));

        if (isActive) {
          state[group] = null;
        } else {
          chip.classList.add("is-active");
          state[group] = value;
        }

        ctaButton.disabled = !state.wer;

        if (state.suche.trim()) {
          runSearch();
        }
      });
    });
  }

  ctaButton.addEventListener("click", showResults);
  resetButton.addEventListener("click", reset);
  emptyResetButton.addEventListener("click", reset);

  function debounce(fn, wait) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, wait);
    };
  }

  const debouncedSearch = debounce(runSearch, 250);

  searchInput.addEventListener("input", () => {
    state.suche = searchInput.value;
    debouncedSearch();
  });

  function normalize(str) {
    return (str || "").toString().toLowerCase();
  }

  function matchesSuche(entry, needle) {
    if (normalize(entry.name).includes(needle)) return true;
    if (normalize(entry.ort).includes(needle)) return true;
    if (normalize(entry.kategorie).includes(needle)) return true;
    if ((entry.stimmung || []).some((s) => normalize(s).includes(needle))) return true;
    return false;
  }

  function matchesFilter(entry) {
    if (state.wer && !(entry.passend_fuer || []).includes(state.wer)) return false;
    if (state.stimmung && !(entry.stimmung || []).includes(state.stimmung)) return false;
    return true;
  }

  function relevanceRank(entry, needle) {
    const name = normalize(entry.name);
    if (name.startsWith(needle)) return 0;
    if (name.includes(needle)) return 1;
    if (normalize(entry.ort).includes(needle) || normalize(entry.kategorie).includes(needle)) return 2;
    return 3;
  }

  function runSearch() {
    const needle = normalize(state.suche.trim());

    if (!needle) {
      if (searchActive) {
        searchActive = false;
        if (state.wer) {
          showResults();
        } else {
          resultsSection.hidden = true;
          emptySection.hidden = true;
        }
      }
      return;
    }

    searchActive = true;

    const treffer = state.daten
      .filter((e) => matchesSuche(e, needle) && matchesFilter(e))
      .sort((a, b) => {
        const ra = relevanceRank(a, needle);
        const rb = relevanceRank(b, needle);
        if (ra !== rb) return ra - rb;
        return (a.name || "").localeCompare(b.name || "", "de");
      });

    if (treffer.length === 0) {
      resultsSection.hidden = true;
      emptyText.textContent = EMPTY_TEXT_SUCHE;
      emptySection.hidden = false;
      return;
    }

    let title = 'Treffer für „' + state.suche.trim() + '“';
    if (state.wer) title += " · " + WER_LABELS[state.wer];
    if (state.stimmung) title += " · " + state.stimmung;
    resultsTitle.textContent = title;

    stack.innerHTML = "";
    treffer.forEach((entry) => stack.appendChild(renderCard(entry)));

    emptySection.hidden = true;
    resultsSection.hidden = false;
  }

  function score(entry) {
    if (!(entry.passend_fuer || []).includes(state.wer)) return -1;
    let s = 1;
    if (state.stimmung && (entry.stimmung || []).includes(state.stimmung)) s += 2;
    return s;
  }

  function showResults() {
    const scored = state.daten
      .map((e) => ({ entry: e, s: score(e) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s);

    const top = pickVaried(scored).slice(0, 3);

    if (top.length === 0) {
      resultsSection.hidden = true;
      emptyText.textContent = EMPTY_TEXT_PICKER;
      emptySection.hidden = false;
      emptySection.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    resultsTitle.textContent =
      "Für dich: " +
      WER_LABELS[state.wer] +
      (state.stimmung ? " · " + state.stimmung : "");

    stack.innerHTML = "";
    top.forEach((entry) => stack.appendChild(renderCard(entry)));

    emptySection.hidden = true;
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // leichte Durchmischung unter gleich bewerteten Treffern, damit nicht
  // immer exakt dieselben drei Orte erscheinen
  function pickVaried(scored) {
    if (scored.length <= 3) return scored.map((x) => x.entry);
    const bestScore = scored[0].s;
    const best = scored.filter((x) => x.s === bestScore);
    const rest = scored.filter((x) => x.s !== bestScore);
    shuffle(best);
    return best.concat(rest).map((x) => x.entry);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function renderCard(entry) {
    const card = document.createElement("article");
    card.className = "card";

    const photo = document.createElement("div");
    photo.className = "card-photo";
    if (entry.bild) {
      photo.style.backgroundImage = "url('" + entry.bild + "')";
    } else {
      const fallback = document.createElement("div");
      fallback.className = "no-photo";
      fallback.textContent = entry.name;
      photo.appendChild(fallback);
      photo.style.background =
        "linear-gradient(135deg, rgba(255,122,61,.35), rgba(167,139,250,.35))";
    }
    card.appendChild(photo);

    const tags = document.createElement("div");
    tags.className = "card-tags";
    (entry.passend_fuer || []).forEach((p) => {
      const t = document.createElement("span");
      t.className = "card-tag " + (p === "18_25" ? "t18_25" : p);
      t.textContent = WER_LABELS[p] || p;
      tags.appendChild(t);
    });
    card.appendChild(tags);

    const h3 = document.createElement("h3");
    h3.textContent = entry.name;
    card.appendChild(h3);

    const ort = document.createElement("p");
    ort.className = "ort";
    ort.textContent = [entry.ort, entry.kategorie].filter(Boolean).join(" · ");
    card.appendChild(ort);

    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = entry.beschreibung || "";
    card.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "meta";
    if (entry.adresse) {
      const a = document.createElement("span");
      a.textContent = entry.adresse;
      meta.appendChild(a);
    }
    const links = document.createElement("span");
    links.className = "links";
    if (entry.website) {
      const w = document.createElement("a");
      w.href = entry.website;
      w.target = "_blank";
      w.rel = "noopener";
      w.textContent = "Webseite";
      links.appendChild(w);
    }
    if (entry.anfahrt_url) {
      if (links.childNodes.length) links.appendChild(document.createTextNode(" · "));
      const r = document.createElement("a");
      r.href = entry.anfahrt_url;
      r.target = "_blank";
      r.rel = "noopener";
      r.textContent = "Route";
      links.appendChild(r);
    }
    if (links.childNodes.length) meta.appendChild(links);
    if (entry.bildquelle && entry.bildquelle !== "eigenes_foto" && entry.bild_fotograf) {
      const credit = document.createElement(entry.bild_quelle_url ? "a" : "span");
      credit.className = "credit";
      credit.textContent =
        "Foto: " + entry.bild_fotograf + " (" + entry.bildquelle + ")";
      if (entry.bild_quelle_url) {
        credit.href = entry.bild_quelle_url;
        credit.target = "_blank";
        credit.rel = "noopener noreferrer";
      }
      meta.appendChild(credit);
    }
    card.appendChild(meta);

    return card;
  }

  function reset() {
    state.wer = null;
    state.stimmung = null;
    state.suche = "";
    searchActive = false;
    searchInput.value = "";
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
    ctaButton.disabled = true;
    resultsSection.hidden = true;
    emptySection.hidden = true;
    document.getElementById("picker").scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
