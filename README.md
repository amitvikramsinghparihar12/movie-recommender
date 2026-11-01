Next Watch: content-based movie recommender

Pick a movie you like and get a list of similar ones. Recommendations are based on each movie's genres, keywords, top 3 cast, director and plot overview, compared with TF-IDF vectors and cosine similarity. The dataset is TMDB 5000 (4,800 movies after removing duplicate titles).

Live demo: https://movie-recommender-ashen-sigma.vercel.app/

Features
Search with suggestions and keyboard support (arrow keys, Enter, Escape)
"Surprise me" button for a random starting movie
Similar movies with a similarity score for each one
Click any recommendation to explore from there
Shareable links: every movie has its own URL (for example /#m155)
Real posters from TMDB, with genre-colored tiles for any movie without a poster
Responsive layout for phone and desktop
How it works
CSV data --> build_model.py --> movies.json + recommendations.json --> static website
(TMDB 5000)   (runs once on       (saved in public/)                   (hosted on Vercel)
              your computer)
Preprocessing. The movies and credits files are joined on movie id. For each movie, genres, keywords, top 3 cast members, the director and the plot overview are combined into one text field. Names are joined into single tokens (for example samworthington) so two people with the same first name do not count as a match.
Vectorizing. TfidfVectorizer (English stop words removed, min_df=2) turns each movie into a vector over 16,639 terms.
Similarity. Cosine similarity compares every movie with every other. Only the top 12 matches per movie are saved, so the large similarity matrix is never stored.
Website. Plain HTML, CSS and JavaScript load the two JSON files and show the results in the browser. There is no server and no database.

The model has no trained weights. It is a non-parametric, content-based approach: the only fitted values are the 16,639 IDF weights, one per vocabulary term.

Project structure
movie-recommender/
├── build_model.py          # builds the JSON files (run on computer)
├── requirements.txt        # Python packages to build_model.py
├── vercel.json             # tells Vercel to serve the public/ folder
├── .gitignore
├── README.md
├── data/                   # raw CSVs and poster cache (not committed)
│   ├── tmdb_5000_movies.csv
│   └── tmdb_5000_credits.csv
└── public/                 # the website, this is what gets deployed
    ├── index.html
    ├── style.css
    ├── script.js
    ├── movies.json
    └── recommendations.json
Run it locally (Windows PowerShell)

You need Python 3.9 or newer.

Download the TMDB 5000 Movie Dataset from Kaggle and place tmdb_5000_movies.csv and tmdb_5000_credits.csv in the data folder.
Create a virtual environment and install the packages:

   pip install -r requirements.txt

On macOS or Linux, activate with source venv/bin/activate instead. 3. Build the data files:

powershell
   python build_model.py --no-posters
Start a local server and open http://localhost:8000:
powershell
   cd public
   python -m http.server 8000

Do not open index.html by double-clicking. Browsers block fetch() for local files.

Add posters

Posters come from TMDB. Get a free API key under Settings, then API (choose the Developer option), and run:

powershell
$env:TMDB_API_KEY="your_key_here"
python build_model.py
Both the short API Key and the long API Read Access Token work.
It makes about 4,800 requests and takes a few minutes. Progress is saved in data/posters_cache.json, so you can stop and run it again to resume.
The key is used only on your computer while building. It is never written into the project files and the deployed site never calls the API. Browsers load poster images directly from TMDB's image server.

No API key? If you have a CSV with a poster column (poster_path, poster_url or poster) and an id column (id, tmdb_id or movie_id) or a title column, use:

powershell
python build_model.py --poster-csv data\your_posters.csv

Movies without a poster are shown as genre-colored tiles.

Deploy to Vercel
Make sure public/movies.json and public/recommendations.json exist and are committed. Vercel only serves what is in the repository and does not run Python.
Push the project to a GitHub repository:

Tech stack
Python: pandas, NumPy, scikit-learn (TF-IDF and cosine similarity), requests
Frontend: HTML, CSS and JavaScript, with no framework or build step
Data: TMDB 5000 Movie Dataset (Kaggle), poster images from the TMDB API
Hosting: Vercel (static site)
Limitations
The model matches on shared words and names, not meaning, so it will not know that "spaceship" and "starship" are related.
Recommendations come only from movie content. No user ratings or viewing history are used, so the results are not personalized.
Similarity scores are raw cosine values, so 20 to 40 percent is normal for a good match.
The dataset covers about 4,800 movies and has no titles newer than the dataset's date.
Possible improvements
Evaluate the recommendations with a metric (for example genre overlap in the top 10) and compare against other methods such as bag of words or sentence embeddings
Stemming, or SVD to capture related words
Free-text search ("space heist with a twist")
Collaborative filtering or a hybrid model using a ratings dataset such as MovieLens
Credits

Movie data and poster images are from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
