// Tiny fetch helper used by the connectors. Connectors declare network access;
// this is the only place they reach the internet.
export async function getJson(url, { headers = {}, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Small graph upsert helpers shared by connectors. */
export function makeGraph(db) {
  const insNode = db.prepare("INSERT OR REPLACE INTO nodes (id, type, name, props) VALUES (?, ?, ?, ?)");
  const insEdge = db.prepare("INSERT INTO edges (type, source_id, target_id, props) VALUES (?, ?, ?, ?)");
  const delEdges = db.prepare("DELETE FROM edges WHERE source_id = ? AND type = ?");
  const getProps = db.prepare("SELECT props FROM nodes WHERE id = ?");
  return {
    node: (id, type, name, props = {}) => insNode.run(id, type, name, JSON.stringify(props)),
    edge: (type, s, t, props = {}) => insEdge.run(type, s, t, JSON.stringify(props)),
    clearEdges: (filmId, type) => delEdges.run(filmId, type), // idempotent re-runs
    mergeFilmProps: (filmId, extra) => {
      const row = getProps.get(filmId);
      if (!row) return;
      const props = { ...JSON.parse(row.props), ...extra };
      insNode.run(filmId, "Film", props.title || null, JSON.stringify(props));
    },
  };
}
