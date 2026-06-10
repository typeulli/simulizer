import { readFile } from "node:fs/promises";
import { IntlMessageFormat } from "intl-messageformat";

// Keys whose values are raw (arrays / nested maps / meta) and never ICU-parsed.
const RAW_TOP = new Set(["block_messages", "block_tooltips", "block_dropdowns", "meta"]);

function* leaves(obj, path = []) {
    for (const [k, v] of Object.entries(obj)) {
        if (path.length === 0 && RAW_TOP.has(k)) continue;
        if (typeof v === "string") yield [[...path, k].join("."), v];
        else if (v && typeof v === "object" && !Array.isArray(v)) yield* leaves(v, [...path, k]);
    }
}

let errors = 0, count = 0;
for (const loc of ["en", "ko"]) {
    const msgs = JSON.parse(await readFile(new URL(`../messages/${loc}.json`, import.meta.url)));
    for (const [key, str] of leaves(msgs)) {
        count++;
        try { new IntlMessageFormat(str, loc); }
        catch (e) { errors++; console.log(`[${loc}] ${key}: ${e.message}\n   value: ${JSON.stringify(str)}`); }
    }
}
console.log(`\nParsed ${count} messages, ${errors} error(s).`);
process.exit(errors ? 1 : 0);
