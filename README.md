# Hexlore

A4 hex plate cartography. Paint a hex map, annotate it, print it at 1:1 on A4
landscape or export it at 300 dpi.

Vanilla HTML, CSS and JavaScript. No dependencies, no package manager, no
bundler beyond `build.js`, which uses nothing but the Node standard library.

## Layout

```
index.html              the app — markup, inline POI sprite, and the load order
css/styles.css          all the CSS, in seven numbered sections
js/                     21 modules, loaded in order; see below
js/examples.js          GENERATED from map/ by build.js — do not hand-edit
assets/features.svg     editable source for the built-in POI icons
map/                    example save files (.hexplate.json)
build.js                example sync + single-file bundle
dist/                   build output, gitignored
```

`js/` in load order: `palette`, `symbols`, `terrains`, `features`, `state`,
`geometry`, `render`, `zoom`, `history`, `edits`, `pointer`, `inspector`,
`rail`, `mapgen`, `exporting`, `custom-tiles`, `custom-features`, `lore`,
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

## Building

```
node build.js
```

Two things happen, both with the Node standard library only:

1. **`js/examples.js` is regenerated from `map/*.hexplate.json`.** The bundled
   example plates used to be pasted in by hand, so there were two copies of
   every map and they drifted apart. Now `map/` is the only source. Each plate
   is stored gzipped and base64'd, which is about half the size of the raw JSON
   even after base64, and the decoded bytes go through the exact same import
   path a gzipped file download already takes.

2. **`dist/hexlore.html` is bundled**, with the stylesheet and all 21 scripts
   inlined in the order `index.html` declares. One portable file you can email
   or drop on a static host instead of 24 requests. `dist/hexlore.html.gz` is
   written next to it for servers that can serve pre-compressed content.

   ```
   241 KB source  ->  164 KB bundled  ->  53 KB gzipped
   ```

`node build.js examples` does step 1 only — that is the one you need after
adding a plate to `map/`.

The minifier strips comments and indentation. It does **not** rename anything,
and it keeps a newline wherever the source had one, so automatic semicolon
insertion behaves exactly as it does unbundled. It is a character walk that
understands strings, template literals, regex literals and comments, which is
what a naive regex pass would get wrong.

Nothing about this is required: `index.html` still opens and runs directly from
the filesystem, unbuilt, exactly as before.

### Changing the built-in POI icons

The point-of-interest icons (Town, Castle, Ruins, etc.) live in an `<svg
id="feature-sprite">` block near the bottom of `index.html`. Each icon is a
`<symbol>` element with a `100×100` viewBox centred at `(50, 50)`. Edit them
directly in `index.html`, or open `assets/features.svg` in a vector editor,
swap the shapes there, then copy the updated `<symbol>` elements back.

Rules for replacement icons:
- Use only black fills and strokes — the renderer tints everything to the map
  ink colour at draw time.
- Use `fill-rule="evenodd"` compound paths for cut-outs (e.g. an arrow slit in
  a tower); white fills will be tinted solid and disappear into the body.
- Keep the icon centred at `(50, 50)` with comfortable padding.

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

`window.storage` only exists inside the Claude artifact runtime. Running
locally, `store()` is a no-op and nothing persists between reloads — that is
expected, not a bug. If you want persistence while developing, a small
`localStorage` shim exposing `get` and `set` is enough.
