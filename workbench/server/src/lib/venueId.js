import { createHash } from "node:crypto";

// Same namespace as seed/venues/export.py so IDs reconcile with venues.jsonl.
const NAMESPACE = "6f1d2c84-0d6c-5f8a-9b3e-2a7c4f9e1b00";

function uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, "");
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function uuid5(name, namespace) {
  const hash = createHash("sha1");
  hash.update(uuidToBytes(namespace));
  hash.update(Buffer.from(name, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
}

/** Deterministic venue id from identity (name|city|COUNTRY), trimmed. */
export function venueId(name, city, country) {
  const key = `${String(name).trim()}|${String(city).trim()}|${String(country).trim().toUpperCase()}`;
  return uuid5(key, NAMESPACE);
}
