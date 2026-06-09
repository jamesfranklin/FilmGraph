// Parsers for the Doc Society CSV's packed multi-value fields. The encodings are
// quirky (festival names and award names can themselves contain ':'), so we
// anchor on the 4-digit year token rather than naive positional splitting.

const YEAR_RE = /^(19|20)\d{2}$/;

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Split a "; "-delimited list, trimming and dropping empties. */
export function splitList(value) {
  if (!value) return [];
  return value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Split a comma-delimited list (Subjects, Countries, Funds, Sites). */
export function splitCommas(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Crew field: "Director:Soniya Kirpalani; Producer:Paco de Onis".
 * Returns [{ role, name }]. Role is everything before the first colon.
 */
export function parseCrew(value) {
  return splitList(value)
    .map((part) => {
      const idx = part.indexOf(":");
      if (idx === -1) return { role: "Crew", name: part.trim() };
      return { role: part.slice(0, idx).trim(), name: part.slice(idx + 1).trim() };
    })
    .filter((c) => c.name);
}

/**
 * Festivals field: "festival:year:award:premiere; ...".
 * Festival names ("CPH:DOX") and award names ("DOX:AWARD") can contain colons,
 * so we locate the year token and read outward from it.
 */
export function parseFestivals(value) {
  return splitList(value)
    .map((part) => {
      const tokens = part.split(":").map((t) => t.trim());
      const yearIdx = tokens.findIndex((t) => YEAR_RE.test(t));
      if (yearIdx === -1) {
        return { name: part.trim(), year: null, award: "", premiere: "" };
      }
      const name = tokens.slice(0, yearIdx).join(":").trim();
      const rest = tokens.slice(yearIdx + 1);
      const premiere = rest.length ? rest[rest.length - 1] : "";
      const award = rest.slice(0, -1).join(":").trim();
      return {
        name,
        year: Number(tokens[yearIdx]),
        award: award || "",
        premiere: (premiere || "").toLowerCase(),
      };
    })
    .filter((f) => f.name);
}

/**
 * Awards field: "year:name:body; ...". Body is often empty.
 * Anchored on the leading year token.
 */
export function parseAwards(value) {
  return splitList(value)
    .map((part) => {
      const tokens = part.split(":").map((t) => t.trim());
      let year = null;
      let start = 0;
      if (tokens.length && YEAR_RE.test(tokens[0])) {
        year = Number(tokens[0]);
        start = 1;
      }
      const rest = tokens.slice(start);
      // Last token is the body when there are >=2 remaining and it's non-empty.
      let body = "";
      let nameTokens = rest;
      if (rest.length >= 2) {
        body = rest[rest.length - 1];
        nameTokens = rest.slice(0, -1);
      }
      const name = nameTokens.join(":").trim();
      return { year, name, body: body.trim() };
    })
    .filter((a) => a.name);
}

/**
 * Purchase Links: "country:name:url; ...". The url contains colons; everything
 * after the second colon is the url.
 */
export function parsePurchaseLinks(value) {
  return splitList(value)
    .map((part) => {
      const first = part.indexOf(":");
      if (first === -1) return null;
      const country = part.slice(0, first).trim();
      const rest = part.slice(first + 1);
      const second = rest.indexOf(":");
      if (second === -1) return { country, name: rest.trim(), url: "" };
      return {
        country,
        name: rest.slice(0, second).trim(),
        url: rest.slice(second + 1).trim(),
      };
    })
    .filter(Boolean);
}

export function toInt(v) {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}
