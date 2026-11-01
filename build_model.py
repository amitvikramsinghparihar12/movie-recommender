"""Build the data files the website needs.

Run once on your own computer (not on Vercel):

    python build_model.py                 # with posters, needs TMDB_API_KEY
    python build_model.py --no-posters    # without posters

Reads   data/tmdb_5000_movies.csv and data/tmdb_5000_credits.csv
Writes  public/movies.json and public/recommendations.json
"""
import argparse
import ast
import json
import os
import re
import time
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# ---------------------------------------------------------------- loading
def parse_names(raw, limit=None, job=None):
    """TMDB stores lists as JSON text. Turn one cell into a list of names."""
    try:
        items = ast.literal_eval(raw)
    except (ValueError, SyntaxError, TypeError):
        return []
    if job:
        items = [i for i in items if i.get("job") == job]
    names = [i["name"] for i in items if "name" in i]
    return names[:limit] if limit else names


def squash(name):
    """'Sam Worthington' -> 'samworthington', so two people who share a
    first name are not treated as a match."""
    return re.sub(r"[^\w]", "", name.lower())


def load_data(data_dir):
    movies = pd.read_csv(data_dir / "tmdb_5000_movies.csv")
    credits = pd.read_csv(data_dir / "tmdb_5000_credits.csv")
    credits = credits.rename(columns={"movie_id": "id"})[["id", "cast", "crew"]]
    df = movies.merge(credits, on="id")  # join on id, not title
    df = df.drop_duplicates(subset="title").reset_index(drop=True)
    df["overview"] = df["overview"].fillna("")
    return df


# ---------------------------------------------------------------- features
def build_tags(df):
    """One text blob per movie: genres, keywords, top 3 cast, director, plot."""
    genres = df["genres"].apply(parse_names)
    keywords = df["keywords"].apply(parse_names)
    cast = df["cast"].apply(lambda x: parse_names(x, limit=3))
    director = df["crew"].apply(lambda x: parse_names(x, job="Director"))

    df["genre_list"] = genres
    tokens = genres + keywords + cast + director
    joined = tokens.apply(lambda t: " ".join(squash(x) for x in t if squash(x)))
    return (joined + " " + df["overview"].str.lower()).str.strip()


def top_similar(matrix, top_n, chunk=500):
    """For every movie, the top_n most similar movies as (row, score) pairs."""
    results = []
    for start in range(0, matrix.shape[0], chunk):
        sims = cosine_similarity(matrix[start:start + chunk], matrix)
        for offset, row in enumerate(sims):
            row[start + offset] = -1  # never recommend a movie to itself
            best = row.argsort()[::-1][:top_n]
            results.append([(int(i), float(row[i])) for i in best if row[i] > 0])
    return results


# ---------------------------------------------------------------- posters
def fetch_posters(ids, api_key, cache_path):
    """Look up each movie's poster_path on TMDB. Progress is cached, so you
    can stop and re-run without starting over."""
    import requests

    cache = {}
    if cache_path.exists():
        cache = json.loads(cache_path.read_text())

    session = requests.Session()
    params = {}
    # TMDB gives two credentials. The short "API Key" goes in the URL; the long
    # "API Read Access Token" (starts with eyJ) goes in a header. Accept both.
    if api_key.startswith("eyJ") or len(api_key) > 40:
        session.headers["Authorization"] = f"Bearer {api_key}"
    else:
        params = {"api_key": api_key}
    todo = [i for i in ids if str(i) not in cache]
    print(f"Posters: {len(cache)} cached, {len(todo)} to fetch")

    for n, movie_id in enumerate(todo, start=1):
        for attempt in range(3):
            try:
                r = session.get(
                    f"https://api.themoviedb.org/3/movie/{movie_id}",
                    params=params,
                    timeout=10,
                )
            except requests.RequestException:
                time.sleep(2)
                continue
            if r.status_code == 429:  # rate limited, wait and retry
                time.sleep(2)
                continue
            if r.status_code == 401:
                raise SystemExit(
                    "TMDB rejected the key. Copy it again from themoviedb.org "
                    "(Settings > API) and check for stray spaces or quotes."
                )
            cache[str(movie_id)] = r.json().get("poster_path") if r.ok else None
            break
        if n % 100 == 0:
            cache_path.write_text(json.dumps(cache))
            print(f"  {n}/{len(todo)}")
        time.sleep(0.03)

    cache_path.write_text(json.dumps(cache))
    missing = sum(1 for v in cache.values() if not v)
    print(f"Posters done. {len(cache) - missing} found, {missing} without a poster.")
    return cache


# ---------------------------------------------------------------- main
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="data", type=Path)
    parser.add_argument("--out-dir", default="public", type=Path)
    parser.add_argument("--top-n", default=12, type=int)
    parser.add_argument("--no-posters", action="store_true")
    args = parser.parse_args()

    df = load_data(args.data_dir)
    df["tags"] = build_tags(df)
    print(f"{len(df)} movies loaded")

    tfidf = TfidfVectorizer(stop_words="english", min_df=2)
    matrix = tfidf.fit_transform(df["tags"])
    print(f"TF-IDF matrix: {matrix.shape[0]} movies x {matrix.shape[1]} terms")

    similar = top_similar(matrix, args.top_n)

    posters = {}
    api_key = os.environ.get("TMDB_API_KEY")
    if args.no_posters:
        print("Skipping posters (--no-posters)")
    elif not api_key:
        print("TMDB_API_KEY not set, skipping posters. Set it and re-run to add them.")
    else:
        posters = fetch_posters(
            df["id"].tolist(), api_key, args.data_dir / "posters_cache.json"
        )

    movies_out, recs_out = [], {}
    for i, row in df.iterrows():
        movie_id = int(row["id"])
        year = str(row.get("release_date", ""))[:4]
        rating = row.get("vote_average")
        movies_out.append({
            "id": movie_id,
            "title": row["title"],
            "year": year if year.isdigit() else None,
            "rating": round(float(rating), 1) if pd.notna(rating) and rating > 0 else None,
            "genres": row["genre_list"],
            "overview": row["overview"],
            "poster": posters.get(str(movie_id)),
        })
        recs_out[movie_id] = [
            [int(df.at[j, "id"]), round(score, 3)] for j, score in similar[i]
        ]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for name, data in (("movies.json", movies_out), ("recommendations.json", recs_out)):
        path = args.out_dir / name
        path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False),
                        encoding="utf-8")
        print(f"Wrote {path} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()