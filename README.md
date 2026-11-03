# Collective Now directory prototype

Static, public-data directory with two preserved entry points:

| Version | Live URL | Files |
| --- | --- | --- |
| Current review (670 entries) | https://alexcentered.github.io/collective-now-prototype-demo/review-2026-10/ | `review-2026-10/` |
| Original website snapshot (367 entries) | https://alexcentered.github.io/collective-now-prototype-demo/ | Root HTML, JS, CSS and `entries.json` |

**Start with the review version.** The root is retained for comparison. “Original” means the public website snapshot, not private source documents, spreadsheets, messages or the private development repository.

## Run locally

Clone this repository, then serve its root (not just the review subdirectory):

```sh
git clone https://github.com/alexcentered/collective-now-prototype-demo.git
cd collective-now-prototype-demo
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/review-2026-10/ for the current review, or http://127.0.0.1:8000/ for the original. A local HTTP server is necessary because the app fetches JSON; opening `index.html` directly as a file can fail.

No build step, package install, API key, account or backend is required. Public map tiles and outbound resources need an internet connection. There is no login, editing database or automatic source synchronization.

## Validate

```sh
python3 scripts/verify_handoff.py
node --check app.js
node --check review-2026-10/app.js
```

The Python check requires Python 3.9 or newer and uses only the standard library. Node is optional for syntax checks. Add `--live` to compare deployed public files with this checkout; use it after a deployment, not while local runtime changes are intentionally unpublished.

Read [HANDOFF.md](HANDOFF.md) for architecture, data conventions, deployment, known gaps and privacy/licensing considerations. Source refreshes require a separately authorized private workflow; raw source files do not belong in this repository.
