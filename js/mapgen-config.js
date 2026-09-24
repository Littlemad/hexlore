/* --------------------------------------------------------------------------
   mapgen-config.js

   Editable presets for climate and other map generation settings.
   This file is loaded before mapgen.js so CLIMATE_PRESETS is available
   to the generator when it runs.

   Uses: nothing
   -------------------------------------------------------------------------- */
"use strict";

const CLIMATE_PRESETS={
  Standard:  { sea:30, mountains:50, forest:50, lakes:50, rivers:50, desert:20, poi:50, roads:50 },
  temperate: { sea:30, mountains:50, forest:55, lakes:50, rivers:55, desert:15, poi:55, roads:55 },
  hot:       { sea:25, mountains:45, forest:40, lakes:25, rivers:35, desert:85, poi:40, roads:40 },
  cold:      { sea:35, mountains:65, forest:40, lakes:70, rivers:55, desert:0,  poi:35, roads:35 }
};
