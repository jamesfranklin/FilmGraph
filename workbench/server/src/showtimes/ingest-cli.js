import { readFileSync } from "node:fs";
import { openDb } from "../db.js";
import { ingestDump } from "../connectors/showtimes_dump.js";
import { recomputeFingerprints } from "../profile.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node src/showtimes/ingest-cli.js <dump.json>");
  process.exit(2);
}
const dump = JSON.parse(readFileSync(file, "utf8"));
const db = openDb();
const result = ingestDump(db, dump);
recomputeFingerprints(db);
console.log(`Ingested: ${result.filmsMatched} films matched, ${result.venues} venue edges.`);
