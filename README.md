I made this since I couldn't find a proper logger/tracker for years!! I've been using yamtrack:https://github.com/FuzzyGrim/Yamtrack (really good, which everyone should try before touching this slop(I wouldn't call this slop at all but thats the convention)) but there are just lot of tiny details which irritates me. 
I have tired: MAL, IMDB, Letterboxd, and there is just something about each which doesn't work for me, so I (ignore if I mention claude as 'I') made this app.

This tracks: Anime, TV Seasons, and Movies
The BEST PART - Or the reason I made this in the first palace: YOU CAN ADD MULTIPLE ENTRIES OF SAME TITLE. and, when watching a TV series or anime, you can have either 1 date per episode, or a range of episodes for a range of dates. 
This just combines all the features I wanted a logger to have in one simple app. 
This was a personal project, which I used to see what claude can do, and damn I am surprised by it. definitely exceed my expectations. I am uploading it here so jic if someone wants something similar, that person doesn't have to burn credits.

to use it, download the apk form the releases, and put in the MAL and TMDB api key in settings, both are free.
TMDB fetches data for Movies  and TV seasons, and MAL for Anime. 
again, this was a side project, wont likely be maintained since I already am happy with all its capabilities. I'll let claude take over now.


---
# Reelog

Log movies, TV episodes and anime: dates, episode ranges, ratings, statuses. Crimson-on-black theme, built from the Claude Design file `Reelog v2.dc.html`. Yamtrack compatible.

- **Movies:** log each watch with a date, an optional rating and notes. Rewatches stack up in the movie's history.
- **TV:** a show opens to its seasons. Log one episode, or a range (e.g. E3–E6) with start and finish dates. Each season has its own status and rating.
- **Anime:** the same episode logging, with data from MyAnimeList.
- **Statuses:** Watching, Planned, Completed, Paused and Dropped. Logging sets Watching or Completed automatically.
- **Ratings:** 0–10 in half steps. Every rating starts as "No rating", and turning one on starts at 7.
- **Library:** filter by status and genre, sort by recent, rating or A–Z, show as a list or a grid.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 (also reachable from your phone on the same network)
npm run build      # production web build in dist/
npm run apk        # Android APK → ./Reelog.apk
```

`npm run apk` needs JDK 21 in `~/.local/share/jdk-21` (or set `JAVA_HOME_21`) and the Android SDK in `~/Android/Sdk`. Android's build tools don't support newer Java versions. Install the APK over the old one and your data is kept.

## API keys (Settings → API keys)

- **TMDB** (movies and TV): an API key or a read access token from themoviedb.org. Without one, search uses a small built-in catalogue.
- **MyAnimeList client ID** (optional): from myanimelist.net/apiconfig. The Android app uses MAL's official API when a client ID is set. Otherwise, and always on the web (MAL blocks browser requests), anime comes from [Jikan](https://jikan.moe), a free mirror of MAL with the same ids.

Posters, runtimes, seasons and episode counts are fetched in the background for everything in the library.

## Data

Everything is stored on the device (`localStorage`, key `reelog-v3`). A v1 movie log is carried over automatically on first launch.

- **Yamtrack CSV import:** movies, TV shows, seasons and episodes, and anime (MAL). Games, books and manga are skipped. Timestamps are converted to your local day. Consecutive episodes watched the same day merge into one range entry, and re-importing skips duplicates.
- **Yamtrack CSV export:** movies and TV. Episode ranges export one row per episode, dated with the range's end date.
- **JSON backup/restore:** everything, including anime. Restore merges with what's already there and also reads v1 backups.
