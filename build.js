/* --------------------------------------------------------------------------
   build.js

   Two jobs, both dependency-free (Node standard library only):

     node build.js examples   regenerate js/examples.js from map/*.hexplate.json
     node build.js            the above, then bundle dist/hexlore.html (+ .gz)

   The bundle inlines the stylesheet and all 21 scripts into one file, in the
   load order index.html declares, so the whole app is a single portable
   document. Comments and indentation are stripped; nothing is renamed, and a
   newline is kept wherever the source had one, so semicolon insertion behaves
   exactly as it does unbundled.
   -------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = __dirname;
const r = (...p) => path.join(ROOT, ...p);

/* --- JS minifier -----------------------------------------------------------
   Character walk that understands the four things a naive regex would ruin:
   strings, template literals, regex literals and comments. It only removes
   comments and redundant whitespace — no renaming, no reordering. */

const IDENT = /[A-Za-z0-9_$]/;
/* A `/` opens a regex literal unless what precedes it can end an expression. */
function regexAllowed(prev) {
  return prev === "" || !(IDENT.test(prev) || prev === ")" || prev === "]" || prev === "}");
}
/* Two tokens need a space between them only if dropping it would fuse them. */
function needsSpace(a, b) {
  if (IDENT.test(a) && IDENT.test(b)) return true;
  return (a === "+" && b === "+") || (a === "-" && b === "-");
}

function minifyJS(src) {
  let out = "", prev = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {              // line comment
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {              // block comment
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {          // string / template
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === c) break;
        j++;
      }
      out += src.slice(i, j + 1); prev = c; i = j + 1;
      continue;
    }
    if (c === "/" && regexAllowed(prev)) {              // regex literal
      let j = i + 1, inClass = false;
      while (j < n) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        else if (d === "\n") break;                     // not a regex after all
        j++;
      }
      j++;
      while (j < n && /[dgimsuvy]/.test(src[j])) j++;
      out += src.slice(i, j); prev = "/"; i = j;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      let j = i, sawNewline = false;
      while (j < n && /\s/.test(src[j])) { if (src[j] === "\n") sawNewline = true; j++; }
      if (j >= n) break;
      /* Keep a newline wherever the source had one: that is what makes this
         safe against automatic semicolon insertion. Drop pure indentation. */
      if (sawNewline) { if (prev !== "") { out += "\n"; prev = "\n"; } }
      else if (needsSpace(prev, src[j])) out += " ";
      i = j;
      continue;
    }
    out += c; prev = c; i++;
  }
  return out;
}

/* --- CSS minifier --------------------------------------------------------- */
function minifyCSS(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")        // comments
    .replace(/\s+/g, " ")                    // whitespace runs
    .replace(/\s*([{}:;,>])\s*/g, "$1")      // around punctuation
    .replace(/;}/g, "}")                     // last semicolon in a block
    .trim();
}

/* --- examples.js: generated from map/, never hand-edited -------------------
   The example plates used to be pasted into js/examples.js by hand, which meant
   two copies of every map that drifted apart. The map/ files are now the only
   source; this rewrites the bundled copies from them. */
function syncExamples() {
  const index = JSON.parse(fs.readFileSync(r("map", "index.json"), "utf8"));
  const rank = n => { const i = index.indexOf(n); return i < 0 ? 1e9 : i; };
  const names = fs.readdirSync(r("map"))
    .filter(f => f.endsWith(".hexplate.json"))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  let plain = 0;
  const entries = names.map(name => {
    const text = JSON.stringify(JSON.parse(fs.readFileSync(r("map", name), "utf8")));
    plain += text.length;
    /* Stored gzipped and base64'd: the decoded bytes go straight into the same
       import path a gzipped file download takes, so nothing new has to parse
       them. Roughly half the size of the raw JSON even after base64. */
    const gz = zlib.gzipSync(Buffer.from(text), { level: 9 }).toString("base64");
    return "  {\n    name: " + JSON.stringify(name) +
           ",\n    gz: " + JSON.stringify(gz) + "\n  }";
  });

  const out = [
    "/* Bundled example maps — embedded so they load on file:// without a server.",
    "",
    "   GENERATED by build.js from map/*.hexplate.json — do not edit by hand.",
    "   Each `gz` is the save file gzipped and base64'd; exporting.js decodes it",
    "   through the same path it uses for a gzipped file on disk.",
    "",
    "   To add an example: drop the .hexplate.json in map/, list it in map/index.json,",
    "   then run `node build.js examples`. */",
    "const EXAMPLE_MAPS = [",
    entries.join(",\n"),
    "];",
    ""
  ].join("\n");

  fs.writeFileSync(r("js", "examples.js"), out);
  return { count: names.length, bytes: Buffer.byteLength(out), plain: plain };
}

/* --- bundle --------------------------------------------------------------- */
function bundle() {
  let html = fs.readFileSync(r("index.html"), "utf8");

  const css = minifyCSS(fs.readFileSync(r("css", "styles.css"), "utf8"));
  html = html.replace(/[ \t]*<link rel="stylesheet" href="css\/styles\.css"[^>]*>/,
                      "<style>" + css + "</style>");

  /* Collect the script srcs in the order index.html lists them — that order is
     a real dependency here, since these are classic scripts sharing one scope. */
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  if (!srcs.length) throw new Error("no <script src> tags found in index.html");

  const js = srcs.map(src => "/*" + src + "*/\n" + minifyJS(fs.readFileSync(r(src), "utf8")))
                 .join("\n;\n");

  /* Replace the whole run of script tags with one inline block. */
  const firstTag = '<script src="' + srcs[0] + '"></script>';
  const lastTag = '<script src="' + srcs[srcs.length - 1] + '"></script>';
  const first = html.indexOf(firstTag);
  const last = html.indexOf(lastTag) + lastTag.length;
  html = html.slice(0, first) + "<script>\n" + js + "\n</script>" + html.slice(last);

  /* Squeeze the markup: drop comments and leading indentation, but leave the
     inline <script> and <style> and any <pre>/<textarea> content alone. */
  html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, "");
  html = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<textarea[\s\S]*?<\/textarea>|<pre[\s\S]*?<\/pre>)/)
             .map((part, k) => k % 2 ? part : part.replace(/\n\s*/g, "\n").replace(/\n+/g, "\n"))
             .join("");

  fs.mkdirSync(r("dist"), { recursive: true });
  fs.writeFileSync(r("dist", "hexlore.html"), html);
  const gz = zlib.gzipSync(Buffer.from(html), { level: 9 });
  fs.writeFileSync(r("dist", "hexlore.html.gz"), gz);
  return { files: srcs.length + 1, bytes: Buffer.byteLength(html), gz: gz.length };
}

/* --- cli ------------------------------------------------------------------ */
const kb = b => (b / 1024).toFixed(1) + " KB";
const mode = process.argv[2] || "all";

const ex = syncExamples();
console.log("examples  " + ex.count + " plates from map/ -> js/examples.js  " + kb(ex.bytes));

if (mode !== "examples") {
  const before = ["index.html", "css/styles.css"]
    .concat(fs.readdirSync(r("js")).map(f => "js/" + f))
    .reduce((s, f) => s + fs.statSync(r(f)).size, 0);
  const b = bundle();
  console.log("bundle    " + b.files + " files -> dist/hexlore.html");
  console.log("          " + kb(before) + " source  ->  " + kb(b.bytes) +
              " bundled  ->  " + kb(b.gz) + " gzipped");
}
