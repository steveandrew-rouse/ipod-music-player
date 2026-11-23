# Sonora — iPod Music Player

An iPod-inspired player with two modes on one device:

- **Online Songs** — search the online catalogue, browse artwork, stream full tracks
  through a tiny local server, with preloading so playback continues smoothly.
- **Global Radio** — live HTTPS MP3 stations from the keyless
  [Radio Browser](https://www.radio-browser.info/) directory, with genre filters.

## Run it

```bash
pip install -r requirements.txt
python server.py
# open http://127.0.0.1:8787
```

`server.py` serves the page and the JSON API. Opening `index.html` on its own still
shows the interface, radio and artwork, but Online Songs needs the server (the page
shows a banner when it is missing).

## How Online Songs works

The browser never talks to the music service directly:

| Endpoint | Purpose |
| :-- | :-- |
| `GET /api/health` | Server availability check |
| `GET /api/search?q=…&limit=…` | Track search: title, artist, album, duration, artwork |
| `GET /api/song?id=…` | Metadata for a pasted link or ID |
| `GET /api/stream/<id>` | Resolves the audio stream and redirects to it |

- **Search and metadata** come from [`ytmusicapi`](https://ytmusicapi.readthedocs.io/),
  which reads the online catalogue (no key, no account).
- **Audio** is resolved with `yt-dlp`, because the catalogue library returns metadata
  but no playable stream URLs. Results are cached for 40 minutes; the browser only
  ever requests `/api/stream/<id>`, so expired links are re-resolved automatically.
- **Smooth playback** uses two audio elements: while one plays, the next track is
  buffered in the other (and its stream URL resolved server-side), so “next” and
  automatic track changes start immediately. Shuffle, repeat (off/all/one), seek,
  volume and the queue all work.
- **Public artwork** comes from the catalogue's CDN, with generated artwork if an
  image fails to load.
- **Paste a link** — a `music.youtube.com/watch?v=…` link, a plain video ID or a
  `youtu.be` link is resolved to its title, artist and artwork.
- Unavailable tracks are marked and skipped automatically.

## Themes

Two authentic iPod modes — **black** and **white** — toggled with ☀/☾ or the `T` key.
Both keep the entire interface visible: screen, seek bar, volume, click wheel, search,
status, mode switch, artwork, queue and footer. Layout, type sizes and control sizes
adapt from phone width upward without hiding any tool.

## Controls

| Input | Action |
| :-- | :-- |
| `Space` | Play / pause |
| `←` `→` | Previous / next |
| `S` | Shuffle |
| `R` | Repeat off → all → one |
| `T` | Black / white theme |
| `/` | Focus search |
| Seek bar | Click, drag or arrow keys to scrub (songs only) |

Preferences — theme, volume, shuffle, repeat, last mode and last track — are kept in
`localStorage`.

## Notes

- The Online Songs mode needs Python with `ytmusicapi` and `yt-dlp`; GitHub Pages
  cannot host it. Radio still works from a static host.
- yt-dlp resolves audio outside the official player. Use it for personal listening
  and respect the source service's terms and the rights of the artists.
- Catalogue results, artwork and streams depend on the upstream service; individual
  tracks can become unavailable, which the player reports rather than hiding.
