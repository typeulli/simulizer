// _log.js — shared console formatting helpers for build scripts

// ── ANSI colours ────────────────────────────────────────────────────────────
const c = {
    reset:  "\x1b[0m",
    bold:   "\x1b[1m",
    dim:    "\x1b[2m",
    cyan:   "\x1b[36m",
    green:  "\x1b[32m",
    yellow: "\x1b[33m",
    red:    "\x1b[31m",
    gray:   "\x1b[90m",
};

const fmt = {
    header:  (s) => `${c.bold}${c.cyan}${s}${c.reset}`,
    label:   (s) => `${c.bold}${s}${c.reset}`,
    path:    (s) => `${c.yellow}${s}${c.reset}`,
    size:    (s) => `${c.green}${s}${c.reset}`,
    arrow:   (s) => `${c.gray}${s}${c.reset}`,
    cmd:     (s) => `${c.dim}${s}${c.reset}`,
    success: (s) => `${c.bold}${c.green}${s}${c.reset}`,
    error:   (s) => `${c.bold}${c.red}${s}${c.reset}`,
    step:    (s) => `${c.gray}${s}${c.reset}`,
};

const kb      = (bytes) => (bytes / 1024).toFixed(1).padStart(7) + " KB";
const divider = () => console.log(fmt.arrow("─".repeat(56)));
const quote   = (p) => `"${p}"`;

module.exports = { c, fmt, kb, divider, quote };
