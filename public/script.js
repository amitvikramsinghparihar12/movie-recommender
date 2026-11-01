(() => {
  const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

  const input = document.getElementById("movie-input");
  const suggestions = document.getElementById("suggestions");
  const surprise = document.getElementById("surprise");
  const status = document.getElementById("status");
  const result = document.getElementById("result");

  let movies = [];
  let recs = {};
  const byId = new Map();
  let matches = [];
  let active = -1;

  // Small helper to build DOM nodes. Text always goes in as text, never HTML.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
    children.forEach((child) => child && node.append(child));
    return node;
  }

  function poster(movie, extraClass) {
    const wrap = el("div", { class: "poster " + (extraClass || "") });
    const showTitle = () => {
      wrap.classList.add("poster-missing");
      wrap.replaceChildren(el("span", { text: movie.title }));
    };
    if (!movie.poster) {
      showTitle();
      return wrap;
    }
    const img = el("img", { src: POSTER_BASE + movie.poster, alt: "", loading: "lazy" });
    img.addEventListener("error", showTitle);
    wrap.append(img);
    return wrap;
  }

  // ---------- search box ----------
  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const movie of movies) {
      const title = movie.title.toLowerCase();
      if (title.startsWith(q)) starts.push(movie);
      else if (title.includes(q)) contains.push(movie);
    }
    return starts.concat(contains).slice(0, 8);
  }

  function hideSuggestions() {
    suggestions.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function showSuggestions() {
    matches = search(input.value);
    active = -1;
    status.textContent = "";

    if (!matches.length) {
      hideSuggestions();
      if (input.value.trim()) {
        status.textContent = "No movie with that title. Check the spelling or try another.";
      }
      return;
    }

    suggestions.replaceChildren(
      ...matches.map((movie, i) => {
        const li = el(
          "li",
          { role: "option", id: "opt-" + i, "aria-selected": "false" },
          el("span", { text: movie.title }),
          movie.year ? el("span", { class: "opt-year", text: movie.year }) : null
        );
        // mousedown (not click) so the input keeps focus until we choose
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          choose(movie);
        });
        return li;
      })
    );
    suggestions.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function setActive(index) {
    const options = suggestions.children;
    if (!options.length) return;
    active = (index + options.length) % options.length;
    [...options].forEach((o, i) => o.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", "opt-" + active);
    options[active].scrollIntoView({ block: "nearest" });
  }

  function choose(movie) {
    hideSuggestions();
    const hash = "#m" + movie.id;
    if (location.hash === hash) render(movie);
    else location.hash = hash; // triggers onHashChange, so the link is shareable
  }

  input.addEventListener("input", showSuggestions);
  input.addEventListener("focus", () => input.value.trim() && showSuggestions());
  input.addEventListener("blur", hideSuggestions);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.hidden) showSuggestions();
      setActive(active + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === "Enter") {
      const pick = active >= 0 ? matches[active] : matches[0];
      if (pick) {
        e.preventDefault();
        choose(pick);
      }
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });

  surprise.addEventListener("click", () => {
    const ids = Object.keys(recs);
    const movie = byId.get(Number(ids[Math.floor(Math.random() * ids.length)]));
    if (movie) choose(movie);
  });

  // ---------- results ----------
  function renderEmpty() {
    document.title = "Next Watch: movie recommendations";
    result.replaceChildren(
      el("p", {
        class: "empty",
        text: "Type a title above, or press Surprise me. You will get movies with similar genres, themes, cast and director.",
      })
    );
  }

  function render(movie) {
    input.value = movie.title;
    status.textContent = "";
    document.title = `More like ${movie.title} | Next Watch`;

    const picks = recs[movie.id] || [];
    const best = picks.length ? picks[0][1] : 1;

    const meta = el("p", { class: "meta" });
    if (movie.year) meta.append(el("span", { text: movie.year }));
    if (movie.rating) meta.append(el("span", { text: `${movie.rating} / 10 on TMDB` }));
    if (movie.genres.length) meta.append(el("span", { text: movie.genres.join(", ") }));

    const picked = el(
      "section",
      { class: "picked" },
      poster(movie),
      el("div", {}, el("h2", { text: movie.title }), meta),
      movie.overview ? el("p", { class: "overview", text: movie.overview }) : null
    );

    const grid = el("ul", { class: "grid" });
    for (const [id, score] of picks) {
      const match = byId.get(id);
      if (!match) continue;
      const bar = el("span", { class: "bar" }, el("span"));
      bar.firstChild.style.width = Math.round((score / best) * 100) + "%";
      const year = match.year ? el("span", { class: "pick-year", text: " " + match.year }) : null;
      grid.append(
        el(
          "li",
          {},
          el(
            "a",
            { href: "#m" + match.id },
            poster(match),
            el("span", { class: "pick-title" }, document.createTextNode(match.title), year),
            el("span", { class: "pick-score", text: Math.round(score * 100) + "% similar" }),
            bar
          )
        )
      );
    }

    result.replaceChildren(
      picked,
      grid.children.length
        ? el("h3", { text: `More like ${movie.title}` })
        : el("p", { class: "empty", text: "No close matches found for this title." }),
      grid
    );
    window.scrollTo(0, 0);
  }

  function onHashChange() {
    const found = location.hash.match(/^#m(\d+)$/);
    const movie = found && byId.get(Number(found[1]));
    if (movie) render(movie);
    else renderEmpty();
  }

  // ---------- start ----------
  async function init() {
    try {
      const [moviesRes, recsRes] = await Promise.all([
        fetch("movies.json"),
        fetch("recommendations.json"),
      ]);
      if (!moviesRes.ok || !recsRes.ok) throw new Error("Data files not found");
      movies = await moviesRes.json();
      recs = await recsRes.json();
    } catch (err) {
      console.error(err);
      input.placeholder = "Movie data not available";
      status.textContent = "Could not load the movie data. Reload the page to try again.";
      return;
    }

    movies.sort((a, b) => a.title.localeCompare(b.title));
    movies.forEach((m) => byId.set(m.id, m));

    input.disabled = false;
    surprise.disabled = false;
    input.placeholder = "Start typing a title, like Inception";

    window.addEventListener("hashchange", onHashChange);
    onHashChange();
  }

  init();
})();
