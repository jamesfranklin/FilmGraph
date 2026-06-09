// Local file storage backing the desktop folders. The Vault and Project folders
// are presented in the Finder as proxies of real files on this machine — this
// module lists them and produces Quick Look previews. Read-only.
import { readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "csv-parse/sync";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const ST = join(DATA, "storage");

// The desktop locations and the real files behind each. `films.csv` in the
// Doc Society folder is the actual corpus export (not duplicated on disk).
const LOCATIONS = [
  {
    id: "vault",
    label: "Vault",
    icon: "/desktop-icons/vault.png",
    note: "Private to this machine.",
    files: [
      { name: "emails.csv", path: join(ST, "emails.csv") },
      { name: "casestudy.pdf", path: join(ST, "casestudy.pdf") },
    ],
  },
  {
    id: "doc-society",
    label: "Doc Society",
    icon: "/desktop-icons/project-docsociety.png",
    note: "Project",
    files: [{ name: "films.csv", path: join(DATA, "films_export_3.csv") }],
  },
  {
    id: "climate-stories",
    label: "Climate Stories",
    icon: "/desktop-icons/project-climate.png",
    note: "Project",
    files: [
      { name: "climate-films.csv", path: join(ST, "climate-films.csv") },
      { name: "impact-report.pdf", path: join(ST, "impact-report.pdf") },
    ],
  },
];

const kindOf = (name) => {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "pdf") return "pdf";
  if (ext === "txt" || ext === "md") return "text";
  return "file";
};

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describe(file) {
  let size = null;
  let mtime = null;
  if (existsSync(file.path)) {
    const s = statSync(file.path);
    size = humanSize(s.size);
    mtime = s.mtime.toISOString().slice(0, 10);
  }
  return { name: file.name, kind: kindOf(file.name), size, modified: mtime };
}

/** All locations with their file listings. */
export function listStorage() {
  return LOCATIONS.map((loc) => ({
    id: loc.id,
    label: loc.label,
    icon: loc.icon,
    note: loc.note,
    files: loc.files.map(describe),
  }));
}

/** A Quick Look preview for one file. CSV → columns + first rows; PDF → meta. */
export function previewFile(folderId, name) {
  const loc = LOCATIONS.find((l) => l.id === folderId);
  if (!loc) return null;
  const file = loc.files.find((f) => f.name === name);
  if (!file || !existsSync(file.path)) return null;

  const kind = kindOf(name);
  const stat = statSync(file.path);
  const base = { name, kind, size: humanSize(stat.size), modified: stat.mtime.toISOString().slice(0, 10) };

  if (kind === "csv") {
    const text = readFileSync(file.path, "utf8");
    const rows = parse(text, { skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
    const totalRows = Math.max(0, rows.length - 1);
    const columns = rows[0] || [];
    const sample = rows.slice(1, 26);
    return { ...base, columns, rows: sample, totalRows };
  }
  if (kind === "pdf") {
    return { ...base, note: "PDF document — opens in Preview on macOS." };
  }
  if (kind === "text") {
    return { ...base, text: readFileSync(file.path, "utf8").slice(0, 4000) };
  }
  return base;
}
