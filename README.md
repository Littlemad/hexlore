# Hexlore

A4 hex plate cartography. Paint a hex map, annotate it, print it at 1:1 on A4
landscape or export it at 300 dpi.

Vanilla HTML, CSS and JavaScript. No dependencies, no package manager, no
bundler beyond a 60-line build script.

## Layout

```
index.html              development entry point — markup, and the load order
css/styles.css          all the CSS, in seven numbered sections
js/                     20 modules, loaded in order; see below
build.js                inlines everything into dist/index.html
dist/index.html         generated — do not edit
.claude/skills/hexlore/ project skill: how to work on this without reading it all
```

`js/` in load order: `palette`, `symbols`, `terrains`, `features`, `state`,
`geometry`, `render`, `zoom`, `history`, `edits`, `pointer`, `inspector`,
`rail`, `exporting`, `custom-tiles`, `custom-features`, `notes-page`,
`storage`, `keys`, `main`.

Every module opens with a header saying what it is for and which names it
borrows from which other file, so you can work on one file without opening the
rest.

## Working on it

Open `index.html` in a browser. It works straight from the filesystem — these
are classic scripts, not ES modules, so there is no CORS problem and no server
required. A server is still nicer if you want live reload:

```
npx serve .
```

To publish as a Claude artifact, which has to be a single self-contained file:

```
node build.js          # writes dist/index.html
```

`build.js` inlines each stylesheet and script in the order `index.html` lists
them, with no minification or transformation, so the built page behaves exactly
like the development page. Rebuild before every publish.

## How it is wired

These files are plain scripts sharing one global scope, not modules. There are
no imports or exports: a function declared in `geometry.js` is simply available
in `render.js`. That is deliberate — it is what the original single-file version
did, so the split moved code without rewriting any of it.

The consequence is that **load order is a dependency**. A file may use anything
declared above it at load time, and anything at all from inside a callback,
which is what most of the app relies on. `main.js` runs last and is the only
file that starts anything.

If you later want real modules, the path is: add `type="module"` to the script
tags, then add explicit `export` and `import` lines guided by the `Uses:` list
already in each file header. Everything needed to do it mechanically is
documented; it is just a larger change than the split itself was.

## Notes on the split

The JavaScript is character-for-character the original, apart from indentation
and added comments. The CSS is the original 122 rules, regrouped by concern but
with the cascade order of every repeated selector preserved.

One intentional change: the page now declares `<!doctype html>`, which the
single-file version did not. This puts the browser in standards mode rather
than quirks mode. Everything here already sets `box-sizing` and explicit
heights, so it should render identically, but it is the one thing worth
eyeballing side by side.

`window.storage` only exists inside the Claude artifact runtime. Running
locally, `store()` is a no-op and nothing persists between reloads — that is
expected, not a bug. If you want persistence while developing, a small
`localStorage` shim exposing `get` and `set` is enough.
