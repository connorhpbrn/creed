import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";

// One intentionally narrow grammar set for every Creed code surface. Keeping
// this shared prevents the editor and read-only renderers drifting in colour or
// language support.
export const creedLowlight = createLowlight({
  bash,
  javascript,
  json,
  markdown,
  typescript,
  yaml,
});
