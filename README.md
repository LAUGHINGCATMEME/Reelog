I made this since I couldn't find a proper logger/tracker for years!! I've been using yamtrack:https://github.com/FuzzyGrim/Yamtrack (really good, which everyone should try before touching this slop(I wouldn't call this slop at all but thats the convention)) but there are just lot of tiny details which irritates me. 
I have tired: MAL, IMDB, Letterboxd, and there is just something about each which doesn't work for me, so I (ignore if I mention claude as 'I') made this app.

This tracks: Anime, TV Seasons, and Movies
The BEST PART - Or the reason I made this in the first palace: YOU CAN ADD MULTIPLE ENTRIES OF SAME TITLE. and, when watching a TV series or anime, you can have either 1 date per episode, or a range of episodes for a range of dates. 
This just combines all the features I wanted a logger to have in one simple app. 
This was a personal project, which I used to see what claude can do, and damn I am surprised by it. definitely exceed my expectations. I am uploading it here so jic if someone wants something similar, that person doesn't have to burn credits.

to use it, download the apk form the releases, and put in the TMDB api key in settings, its free.
TMDB fetches data for Movies  and TV seasons, and AniList (no key needed) for Anime. 
again, this was a side project, Ill try to update it whenever I face any bugs. I'll let claude take over now.


---
# Reelog

Log movies, TV episodes and anime: dates, episode ranges, ratings, statuses. Crimson-on-black, with OLED and White themes too.

- **Movies:** log each watch with a date, an optional rating and notes. Rewatches stack up in the movie's history.
- **TV:** a show opens to its seasons. Log one episode, or a range (e.g. E3–E6) with start and finish dates. Each season has its own status and rating.
- **Anime:** the same episode logging, with data from AniList. Seasons, movies and OVAs of a franchise are grouped into one title (following AniList's sequel, prequel and side-story links), including entries you haven't added yet. Titles in English or in romaji (Settings → Anime titles).
- **Anime films:** logged as watches, like movies (no "episode 1"), with a watch history. Settings → Anime films lists them under Anime, Movies or both.
- **Up next:** TV seasons and anime you're watching, at the top of their tab. One tap logs the next episode for today, with Undo.
- **Episode grid:** tap an episode to log it. Tapping one further on logs everything up to it: with 1–5 watched, tapping 9 logs 6–9. "Next episode" means the one after the furthest you've watched, so skipped episodes don't hold you back.
- **Detail pages:** overview, facts, cast and crew (TMDB), characters and staff (AniList), the next episode's air date, and when you first and last watched it.
- **Statuses:** Watching, Planned, Completed, Paused and Dropped. Logging sets Watching or Completed automatically.
- **Ratings:** 0–10 in half steps. Every rating starts as "No rating", and turning one on starts at 7.
- **Library:** filter by status and genre, sort by first started, last watched, rating or A–Z (remembered per tab), show as a list or a grid.
- **Diary** (Settings): every watch by date, month by month, filtered by kind and year.
- **Tier lists** (Settings): rank movies, shows and anime from S to F. Start from your ratings or from scratch; tap a poster then where it goes, or hold and drag it. Rename and recolour tiers, add or remove them, and share the list as an image or as text.
- **Statistics** (Settings): time watched, streaks, activity by year, month and weekday, top rated, most watched, statuses, ratings and genres.
- **Themes:** System, Black, OLED (true black) and White.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 (also reachable from your phone on the same network)
npm run build      # production web build in dist/
npm run apk        # Android APK → ./Reelog-<version>.apk
```

`npm run apk` needs JDK 21 in `~/.local/share/jdk-21` (or set `JAVA_HOME_21`) and the Android SDK in `~/Android/Sdk`. Android's build tools don't support newer Java versions. The app version comes from `package.json`.

**Signing:** with `android/keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`; git-ignored) the APK is a signed release build. Without it, it's a debug build signed with this computer's debug key. Android only installs an update over the old app when both are signed with the same key, so pick one and keep it: switching means uninstalling (export a backup first).

## Sources

- **TMDB** (movies and TV): enter an API key or a read access token from themoviedb.org in Settings. Without one, search uses a small built-in catalogue.
- **AniList** (anime): public API, no key needed.

Posters, runtimes, seasons and episode counts are fetched in the background for everything in the library. Overviews and cast are fetched when you open a title and cached.

## Data

Everything is stored on the device (`localStorage`, key `reelog-v4`). Nothing is sent anywhere except lookups to TMDB and AniList, and GitHub when you check for updates.

- **Backup:** one JSON file with everything, tier lists included. Export, then Restore with Replace or Merge. The format is documented in [docs/BACKUP.md](docs/BACKUP.md).
- **Auto-backup** (Android app): each day the log changes, a backup goes to `Documents/Reelog/` when the app is closed or sent to the background. The newest 10 are kept. They survive uninstalling the app.
- **Older data:** anime logged with MyAnimeList ids (Reelog before 1.0, and version 3 backups) are matched to AniList ids in the background.
