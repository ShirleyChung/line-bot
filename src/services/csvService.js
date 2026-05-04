// src/services/csvService.js

export function jsonToCSV(data, fields) {
  const header = fields.join(",");
  const row = fields.map((f) => data[f] ?? "").join(",");

  return `${header}\n${row}`;
}