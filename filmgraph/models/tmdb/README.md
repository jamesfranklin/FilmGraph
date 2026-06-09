# TMDB client

A minimal client for the [TMDB API](https://developer.themoviedb.org/), used by
`seed/films/tmdb_fetch.py` to populate Film nodes.

- The API key is read from the `TMDB_API_KEY` environment variable **only**.
  There is no hardcoded key and no alternative path.
- You must supply your own TMDB API key and comply with the
  [TMDB terms of service](https://www.themoviedb.org/terms-of-use). Bulk
  redistribution of TMDB data is not permitted; each operator is responsible for
  their own API usage.

```python
from filmgraph.models.tmdb.client import TMDBClient

client = TMDBClient()          # reads TMDB_API_KEY from env
movie = client.get_movie(496243)
```

This product uses the TMDB API but is not endorsed or certified by TMDB.
