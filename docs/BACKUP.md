# Reelog backup format (version 4)

Reelog's one import/export file. **Settings → Backup → Export** writes it, **Restore** reads it (Replace or Merge), and the Android app writes one to `Documents/Reelog/` each day the log changes (the newest 10 are kept).

The file is JSON:

```json
{
  "app": "reelog",
  "version": 4,
  "appVersion": "1.2.0",
  "exported": "2026-10-27T17:10:26.176Z",
  "settings": {
    "layout": "list", "rating": "slider", "groupAnime": true, "theme": "black", "autoBackup": true,
    "titles": "english", "animeFilms": "anime", "sort": { "movie": "recent", "tv": "recent", "anime": "recent" },
    "tapHalf": "down", "publicScores": true, "rewatchShades": false, "groupEps": "off", "shareQuality": 6
  },
  "entries": [],
  "status": {},
  "rates": {},
  "notes": {},
  "groupRates": {},
  "groupNotes": {},
  "animeGroups": {},
  "tierLists": [],
  "meta": {}
}
```

Only `app` (always `"reelog"`), `version` and `entries` are required. Everything else is optional; a setting the file leaves out keeps its value on the device.

## Ids

| Kind    | `ref` is the…                                        |
|---------|------------------------------------------------------|
| `movie` | TMDB movie id (`themoviedb.org/movie/<id>`)          |
| `tv`    | TMDB TV show id (`themoviedb.org/tv/<id>`)           |
| `anime` | **AniList** anime id (`anilist.co/anime/<id>`). Not MyAnimeList. |

## `entries`

One object per watch. Dates are `YYYY-MM-DD` in your local time, never in the future.

**Movie watch:**
```json
{ "kind": "movie", "ref": 603, "date": "2024-03-01", "score": 8.5, "notes": "theater" }
```

**Episodes of a TV season:** one episode, or a run of consecutive episodes watched from `start` to `end`.
```json
{ "kind": "tv", "ref": 1396, "season": 1, "epFrom": 1, "epTo": 7, "start": "2026-01-08", "end": "2026-01-10", "score": null, "notes": "" }
```

**Episodes of an anime:** the same, without `season`. Each AniList entry (season, movie, OVA) has its own id and its episodes start at 1.
```json
{ "kind": "anime", "ref": 16498, "epFrom": 1, "epTo": 25, "start": "2021-06-01", "end": "2021-06-02" }
```

Field rules:
- `id` (string): optional. Reelog makes one if it's missing.
- `score`: `0`–`10` in steps of `0.5`, or `null` / missing for no rating.
- `notes`: optional string.
- `epTo`: optional, defaults to `epFrom`. Must be ≥ `epFrom`.
- `end`: optional, defaults to `start`. Must be on or after `start`.
- `season`: TV only, defaults to `1`. `0` is Specials.
- An anime movie is one episode: `"epFrom": 1, "epTo": 1`. Each watch of it is one such entry, and its rating goes in `rates` like any anime's. A `score` on one of its watches is moved to `rates` (or dropped, if `rates` has one).
- Rewatches are just more entries. The same episodes or movie can appear any number of times.

Entries that break these rules are skipped on import, and the restore dialog says how many.

## `status`

Explicit statuses. You only need this for titles whose status isn't implied by their entries (planned, paused, dropped), or where you want to set it yourself. Values: `watching`, `planned`, `completed`, `paused`, `dropped`.

Keys:
- `movie:<tmdb id>`
- `anime:<anilist id>`
- `tv:<tmdb id>:<season>`. TV status is per season.

```json
{ "movie:603": "completed", "anime:16498": "completed", "tv:1396:1": "completed", "anime:154587": "planned" }
```

With no status, a title that has entries counts as Watching (movies: Completed).

## `rates`

Title ratings, `0`–`10` in steps of `0.5`. Same keys as `status`. Anime and TV seasons are rated here; movies are rated per watch, in their entries.

```json
{ "anime:16498": 9, "tv:1396:1": 9.5 }
```

## `notes`

Your notes on a title rather than on one watch: an anime or a TV season. Same keys as `rates`. Line breaks are kept.

```json
{ "anime:16498": "The basement reveal.\nRewatch before S4." }
```

## `groupRates`, `groupNotes`

A whole anime group's own rating and notes, apart from its members' in `rates` and `notes`. Keyed by the AniList id of a member of the group (Reelog uses its first TV series); with no group rating, the library shows the average of the members'.

```json
{ "16498": 9.5 }
```

## `animeGroups`

Optional manual grouping. Anime group automatically along AniList's sequel, prequel, side-story and parent links. Only list ids here to override that: `"<anilist id>": <anilist id of another member>` joins that one's group, and `"<id>": <same id>` keeps it on its own.

## `tierLists`

Tier lists, newest first. Items are titles keyed like `meta`: `movie:<tmdb id>`, `tv:<tmdb id>` (the whole show) or `anime:<anilist id>`. With anime grouping on, a franchise is ranked as its first TV series' id. Each title is in one place only: a tier, or `pool` (added, not ranked yet).

```json
{
  "id": "t1k2x9",
  "name": "Best anime",
  "kinds": ["anime"],
  "tiers": [
    { "id": "r1", "label": "S", "color": "#E5485C", "items": ["anime:16498", "anime:5114"] },
    { "id": "r2", "label": "A", "color": "#E8834A", "items": [] }
  ],
  "pool": ["anime:21"],
  "created": "2026-10-27T12:00:00.000Z",
  "updated": "2026-10-27T12:30:00.000Z"
}
```

- `kinds`: what the list ranks (`movie`, `tv`, `anime`); titles of these kinds are offered when adding.
- `label`: up to 16 characters. `color`: `#RRGGBB`.
- Items in more than one place, or that aren't title keys, are dropped on import. Merge adds lists whose `id` isn't on the device yet.

## `meta`

A cache of titles, posters and episode counts, keyed `movie:<id>`, `tv:<id>` or `anime:<id>`. It's optional: Reelog fetches anything missing. When building a file by hand, a `title` per anime makes the file easier to read, e.g. `"anime:16498": { "title": "Shingeki no Kyojin" }`. Anime also have `titleEn`, the English title (the romaji one when AniList has none).

## `settings`

Display settings; API keys are never in a backup.

| Key | Values |
|-----|--------|
| `layout` | `list`, `grid` |
| `rating` | `slider`, `tap` |
| `groupAnime` | `true`, `false` |
| `theme` | `system`, `black`, `oled`, `white` |
| `autoBackup` | `true`, `false` (Android app) |
| `titles` | `english`, `romaji`: how anime titles are shown |
| `animeFilms` | `anime`, `movies`, `both`: which tab lists anime films |
| `sort` | per tab (`movie`, `tv`, `anime`): `started`, `recent`, `rating`, `title` |
| `tapHalf` | `down`, `up`: tap rating, tapping the same number again gives half a point less or more |
| `publicScores` | `true`, `false`: AniList and TMDB scores on title pages |
| `rewatchShades` | `true`, `false`: episodes watched more often are a darker red |
| `groupEps` | `off`, `continuous`, `seasons`: all of an anime group's episodes on its page |
| `shareQuality` | `1`–`10`: tier list images, `10` is lossless PNG |

## Older files

Version 3 backups (anime keyed by MyAnimeList id) and version 1 (movies only) still import. Version 3 anime are matched to AniList ids in the background. Any AniList doesn't list stay under `legacyMal` in the file until they're matched or removed.
