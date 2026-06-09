import { useEffect, useState } from "react";
import { api, type FilmListItem, type VenueSeries } from "./lib/api";

export function App() {
  const [films, setFilms] = useState<FilmListItem[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [series, setSeries] = useState<VenueSeries>(null);

  useEffect(() => { api.films().then((r) => setFilms(r.items)).catch(console.error); }, []);
  useEffect(() => {
    if (!sel) return;
    setSeries(null);
    api.venueSeries(sel).then((r) => setSeries(r.venue_series)).catch(console.error);
  }, [sel]);

  return (
    <div className="wrap">
      <div className="col">
        <table>
          <tbody>
            {films.map((f) => (
              <tr className="row" key={f.id} onClick={() => setSel(f.id)}>
                <td>{f.title}</td><td className="faint">{f.year ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="col">
        {!series && <div className="faint">Select a film with venue data.</div>}
        {series && (
          <table>
            <thead><tr><th>Week</th><th>Venues</th><th>Sessions</th><th>Shape</th></tr></thead>
            <tbody>
              {series.weeks.map((w, i) => (
                <tr key={w}>
                  <td>{w}</td><td>{series.venuesRaw[i]}</td><td>{series.sessionsRaw[i]}</td>
                  <td><span className="bar" style={{ width: `${series.venues[i] * 120}px` }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
