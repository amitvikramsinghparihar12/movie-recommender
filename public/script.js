(() => {
  const IMG = "https://image.tmdb.org/t/p/";
  const input = document.getElementById("movie-input");
  const list = document.getElementById("suggestions");
  const view = document.getElementById("view");
  const byId = new Map();
  const genres = new Map();
  let movies = [], recs = {}, matches = [], active = -1, wantGenres = false;

  const GENRE_HUE = {
    Action: 12, Adventure: 35, Animation: 185, Comedy: 50, Crime: 275,
    Documentary: 160, Drama: 315, Family: 130, Fantasy: 255, History: 75,
    Horror: 355, Music: 290, Mystery: 225, Romance: 335, "Science Fiction": 205,
    "TV Movie": 95, Thriller: 18, War: 100, Western: 38,
  };

  // ---------- helpers ----------
  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    kids.forEach((c) => c && node.append(c));
    return node;
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const posterUrl = (m, size) =>
    !m.poster ? null : m.poster.startsWith("http") ? m.poster : IMG + size + m.poster;

  function hueOf(name) {
    if (name in GENRE_HUE) return GENRE_HUE[name];
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }
  const hueFor = (m) => hueOf(m.genres.find((g) => g in GENRE_HUE) || m.title);
  const gradient = (hue) =>
    `linear-gradient(160deg, hsl(${hue} 60% 34%), hsl(${(hue + 40) % 360} 55% 18%))`;

  function tile(m) {
    const node = el("div", { class: "tile" },
      el("span", { class: "tile-title", text: m.title }),
      el("span", { class: "tile-meta" },
        el("span", { text: m.year || "" }), el("span", { text: m.genres[0] || "" })));
    node.style.background = gradient(hueFor(m));
    return node;
  }

  function poster(m) {
    const wrap = el("div", { class: "poster" });
    const src = posterUrl(m, "w342");
    if (!src) { wrap.append(tile(m)); return wrap; }
    const img = el("img", { src, alt: "", loading: "lazy" });
    img.addEventListener("error", () => wrap.replaceChildren(tile(m)));
    wrap.append(img);
    return wrap;
  }

  const link = (text, cls, href, extra = {}) => el("a", { class: "btn " + cls, href, text, ...extra });
  function action(text, cls, fn) {
    const b = el("button", { class: "btn " + cls, type: "button", text });
    b.addEventListener("click", fn);
    return b;
  }

  // ---------- building blocks ----------
  function card(m, note) {
    return el("a", { class: "card", href: "#m" + m.id }, poster(m),
      el("div", { class: "card-info" },
        el("strong", { text: m.title }),
        el("span", { class: "card-meta" },
          el("span", { text: m.year || "" }),
          el("span", { text: note || m.genres[0] || "" }))));
  }

  function rail(cards, label) {
    const track = el("div", { class: "rail", "aria-label": label });
    cards.forEach((c) => track.append(c));
    const go = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: "smooth" });
    const prev = el("button", { class: "arrow prev", type: "button", "aria-label": "Scroll left", text: "‹" });
    const next = el("button", { class: "arrow next", type: "button", "aria-label": "Scroll right", text: "›" });
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    return el("div", { class: "rail-wrap" }, prev, track, next);
  }

  function section(title, href, content, id) {
    const head = el("div", { class: "sec-head" }, el("h2", { text: title }));
    if (href) head.append(el("a", { class: "all", href, text: "View all →" }));
    const sec = el("section", { class: "sec" }, head, content);
    if (id) sec.id = id;
    return sec;
  }

  function hero(m, label, buttons) {
    const node = el("section", { class: "hero" });
    node.style.setProperty("--hue", hueFor(m));
    const src = posterUrl(m, "w500");
    if (src) node.style.setProperty("--bg-img", `url("${src}")`);

    const meta = el("p", { class: "hero-meta" });
    if (m.year) meta.append(el("span", { text: m.year }));
    if (m.rating) meta.append(el("span", { class: "badge", text: m.rating + " / 10" }));
    m.genres.slice(0, 3).forEach((g) => meta.append(el("span", { text: g })));

    node.append(el("div", { class: "wrap" }, el("div", { class: "hero-text" },
      el("span", { class: "tag", text: label }),
      el("h1", { text: m.title }),
      meta,
      m.overview ? el("p", { class: "overview", text: m.overview }) : null,
      el("div", { class: "btns" }, ...buttons))));
    if (src) node.append(el("img", { class: "hero-poster", src, alt: "" }));
    return node;
  }

  function best(g) {
    const all = (genres.get(g) || []).slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const withPoster = all.filter((m) => m.poster);
    return withPoster.length >= 12 ? withPoster : all;
  }
  const genreHref = (g) => "#g-" + encodeURIComponent(g);

  // ---------- views ----------
  function renderHome() {
    document.title = "Next Watch: movie recommendations";
    const pool = movies.filter((m) => m.poster && m.rating >= 7 && m.overview);
    const feat = pick(pool.length ? pool : movies);

    // 3 different genres every time the home page is built
    const names = shuffle([...genres.keys()].filter((g) => genres.get(g).length >= 20)).slice(0, 3);
    const rows = names.map((g) =>
      section(g, genreHref(g),
        rail(shuffle(best(g).slice(0, 60)).slice(0, 14).map((m) => card(m)), g + " movies")));

    const all = [...genres.keys()].sort((a, b) => genres.get(b).length - genres.get(a).length);
    const tiles = el("div", { class: "genres" }, ...all.map((g) => {
      const t = el("a", { class: "gtile", href: genreHref(g), text: g });
      t.style.background = gradient(hueOf(g));
      return t;
    }));

    view.replaceChildren(
      hero(feat, "Featured", [link("More like this", "primary", "#m" + feat.id), action("Shuffle", "ghost", renderHome)]),
      el("div", { class: "wrap" }, ...rows, section("Browse by Genre", null, tiles, "genres")));
    if (wantGenres) document.getElementById("genres").scrollIntoView();
    else window.scrollTo(0, 0);
    wantGenres = false;
  }

  function renderGenre(g) {
    document.title = `${g} movies | Next Watch`;
    const items = best(g).slice(0, 60);
    view.replaceChildren(el("div", { class: "wrap" },
      el("div", { class: "page-head" }, el("h1", { text: g }), el("p", { text: `Top rated ${g.toLowerCase()} movies` })),
      el("div", { class: "sec grid" }, ...items.map((m) => card(m)))));
    window.scrollTo(0, 0);
  }

  function renderMovie(m) {
    document.title = `More like ${m.title} | Next Watch`;
    const picks = (recs[m.id] || []).map(([id, s]) => [byId.get(id), s]).filter(([x]) => x);
    const content = picks.length
      ? rail(picks.map(([x, s]) => card(x, Math.round(s * 100) + "% similar")), "Similar movies")
      : el("p", { class: "empty", text: "No close matches found for this title." });
    view.replaceChildren(
      hero(m, "Selected", [action("Surprise me", "primary", surprise), link("Home", "ghost", "#", { "data-home": "" })]),
      el("div", { class: "wrap" }, section(`More like ${m.title}`, null, content)));
    window.scrollTo(0, 0);
  }

  function surprise() {
    location.hash = "#m" + pick(Object.keys(recs));
  }

  function route() {
    const h = location.hash;
    const found = h.match(/^#m(\d+)$/);
    if (found && byId.has(Number(found[1]))) return renderMovie(byId.get(Number(found[1])));
    if (h.startsWith("#g-")) {
      try {
        const g = decodeURIComponent(h.slice(3));
        if (genres.has(g)) return renderGenre(g);
      } catch (e) { /* bad link, fall through to home */ }
    }
    renderHome();
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-home],[data-genres]");
    if (!a) return;
    e.preventDefault();
    wantGenres = a.hasAttribute("data-genres");
    if (location.hash) location.hash = "";
    else renderHome();
  });

  // ---------- search ----------
  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = [], contains = [];
    for (const m of movies) {
      const t = m.title.toLowerCase();
      if (t.startsWith(q)) starts.push(m);
      else if (t.includes(q)) contains.push(m);
    }
    return starts.concat(contains).slice(0, 8);
  }

  function hideList() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function showList() {
    matches = search(input.value);
    active = -1;
    if (!input.value.trim()) return hideList();
    if (!matches.length) {
      list.replaceChildren(el("li", { class: "none", text: "No movie with that title" }));
    } else {
      list.replaceChildren(...matches.map((m, i) => {
        const li = el("li", { role: "option", id: "opt-" + i, "aria-selected": "false" },
          el("span", { text: m.title }), m.year ? el("span", { class: "yr", text: m.year }) : null);
        li.addEventListener("mousedown", (e) => { e.preventDefault(); choose(m); });
        return li;
      }));
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function setActive(i) {
    const opts = list.querySelectorAll("[role=option]");
    if (!opts.length) return;
    active = (i + opts.length) % opts.length;
    opts.forEach((o, n) => o.setAttribute("aria-selected", String(n === active)));
    input.setAttribute("aria-activedescendant", "opt-" + active);
    opts[active].scrollIntoView({ block: "nearest" });
  }

  function choose(m) {
    hideList();
    input.value = "";
    input.blur();
    const h = "#m" + m.id;
    if (location.hash === h) route();
    else location.hash = h;
  }

  input.addEventListener("input", showList);
  input.addEventListener("focus", () => input.value.trim() && showList());
  input.addEventListener("blur", hideList);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) showList(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") {
      const m = active >= 0 ? matches[active] : matches[0];
      if (m) { e.preventDefault(); choose(m); }
    } else if (e.key === "Escape") hideList();
  });

  // ---------- start ----------
  async function init() {
    try {
      const [mRes, rRes] = await Promise.all([fetch("movies.json"), fetch("recommendations.json")]);
      if (!mRes.ok || !rRes.ok) throw new Error("Data files not found");
      movies = await mRes.json();
      recs = await rRes.json();
    } catch (err) {
      console.error(err);
      input.placeholder = "Data not available";
      view.replaceChildren(el("div", { class: "wrap" },
        el("p", { class: "empty", text: "Could not load the movie data. Reload the page to try again." })));
      return;
    }
    for (const m of movies) {
      byId.set(m.id, m);
      for (const g of m.genres) {
        if (!genres.has(g)) genres.set(g, []);
        genres.get(g).push(m);
      }
    }
    input.disabled = false;
    input.placeholder = "Search movies...";
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();