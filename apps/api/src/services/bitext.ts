export type BitextRow = { instruction: string; response: string; intent: string };

function cleanResponseTemplate(response: string) {
  return response.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, raw: string) => {
    const field = raw.trim().toLowerCase();
    if (field.includes("customer support hours")) return "customer support hours";
    if (field.includes("customer support phone")) return "phone support";
    if (field.includes("customer support email")) return "email support";
    if (field.includes("website url")) return "website";
    if (field.includes("online company portal")) return "online company portal";
    return field.replace(/\burl\b/g, "website address");
  });
}

export function prepareBitextRows(rows: BitextRow[]): BitextRow[] {
  const unique = new Map<string, BitextRow>();
  for (const row of rows) {
    const instruction = row.instruction.trim().replace(/\s+/g, " ");
    const response = cleanResponseTemplate(row.response).trim().replace(/\s+/g, " ");
    if (!instruction || !response || /please go ahead and ask your question/i.test(response)) continue;
    const key = instruction.toLowerCase();
    if (!unique.has(key)) unique.set(key, { ...row, instruction, response });
  }
  return [...unique.values()];
}

export function parseBitextCsv(csv: string): BitextRow[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted && char === '"' && csv[i + 1] === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("Dataset CSV contains an unterminated quoted field");
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift()?.map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "").trim() : value.trim()) ?? [];
  const columns = ["instruction", "response", "intent"].map((name) => header.indexOf(name));
  if (columns.some((index) => index < 0)) throw new Error("Bitext CSV must include instruction, response, and intent columns");
  return rows.map((values) => ({
    instruction: values[columns[0]] ?? "", response: values[columns[1]] ?? "", intent: values[columns[2]] ?? ""
  }));
}
