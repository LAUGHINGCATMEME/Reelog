# Reelog

Movie log: search a movie, log the date you watched it, a rating and notes. Rewatches stack up in each movie's history. Crimson-on-black theme, built from the Claude Design file `Reelog.dc.html`.

## Run

```sh
npm install
npm run dev        # http://localhost:5173, also reachable from your phone on the same network
npm run build      # production build in dist/
npm run preview    # serve dist/
```

## On Android

Deploy `dist/` to any static host with HTTPS (GitHub Pages, Netlify, Cloudflare Pages). Open it in Chrome and choose **Add to Home screen** / **Install app**. It runs full-screen, works offline, and the system back button closes the sheet or dialog that's on top before leaving the app.

## TMDB

Search uses a small offline catalogue until you add a TMDB key under **Data → Settings**. You can use either a v3 API key or a v4 read access token. With a key, search runs against TMDB, and posters, runtime, director and genres fill in for everything in your library. To build a key in, set `VITE_TMDB_KEY` in `.env.local`.

## Data

Everything is stored on the device in `localStorage` (`reelog-v1`).

- **Yamtrack CSV export/import:** one row per watch. Import keeps movie rows only and skips duplicates (same movie + same date).
- **JSON backup/restore:** restore merges with what's already there.
