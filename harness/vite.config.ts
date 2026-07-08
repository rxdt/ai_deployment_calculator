import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const frontendRoot = fileURLToPath(new URL("../frontend", import.meta.url));

interface BundleAsset {
  readonly type: "asset";
  readonly fileName: string;
  source: string | Uint8Array;
}

interface BundleChunk {
  readonly type: "chunk";
  readonly fileName: string;
  readonly code: string;
}

type BundleItem = BundleAsset | BundleChunk;
type BuildBundle = Record<string, BundleItem>;
type TextAsset = BundleAsset & { source: string };

/**
Returns true for text assets that can be inlined into HTML.
@param item - generated bundle item
@param extension - file extension to match
*/
function isTextAsset(item: BundleItem, extension: string): item is TextAsset {
  return (
    item.type === "asset" &&
    item.fileName.endsWith(extension) &&
    typeof item.source === "string"
  );
}

/**
Returns true for generated JavaScript chunks.
@param item - generated bundle item
*/
function isScriptChunk(item: BundleItem): item is BundleChunk {
  return item.type === "chunk" && item.fileName.endsWith(".js");
}

/**
Returns text assets with the requested extension.
@param bundle - generated bundle map
@param extension - file extension to match
*/
function textAssets(
  bundle: BuildBundle,
  extension: string,
): [string, TextAsset][] {
  return Object.entries(bundle).filter((entry): entry is [string, TextAsset] =>
    isTextAsset(entry[1], extension),
  );
}

/**
Returns generated JavaScript chunks.
@param bundle - generated bundle map
*/
function scriptChunks(bundle: BuildBundle): [string, BundleChunk][] {
  return Object.entries(bundle).filter(
    (entry): entry is [string, BundleChunk] => isScriptChunk(entry[1]),
  );
}

/**
Escapes a stylesheet before placing it in an inline `<style>` tag.
@param value - stylesheet source
*/
function escapeStyleContent(value: string): string {
  return value.replaceAll("</style", String.raw`<\/style`);
}

/**
Escapes JavaScript before placing it in an inline module script.
@param value - JavaScript source
*/
function escapeScriptContent(value: string): string {
  return value.replaceAll("</script", String.raw`<\/script`);
}

/**
Replaces every literal occurrence without interpreting `$` replacement tokens.
@param source - source text to edit
@param search - literal text to replace
@param replacement - literal replacement text
*/
function replaceLiteral(
  source: string,
  search: string,
  replacement: string,
): string {
  return source.split(search).join(replacement);
}

/**
Returns the stylesheet tags Vite may emit for a generated CSS asset.
@param fileName - generated CSS file name
*/
function stylesheetTags(fileName: string): string[] {
  const href = `/${fileName}`;
  return [
    `<link rel="stylesheet" crossorigin href="${href}">`,
    `<link rel="stylesheet" href="${href}">`,
  ];
}

/**
Returns the script tags Vite may emit for a generated JavaScript chunk.
@param fileName - generated JavaScript file name
*/
function scriptTags(fileName: string): string[] {
  const source = `/${fileName}`;
  return [
    `<script type="module" crossorigin src="${source}"></script>`,
    `<script type="module" src="${source}"></script>`,
  ];
}

/**
Inlines generated stylesheets into HTML source.
@param source - HTML source
@param stylesheets - generated CSS assets
*/
function inlineStylesheets(
  source: string,
  stylesheets: readonly [string, TextAsset][],
): string {
  let next = source;
  for (const [fileName, stylesheet] of stylesheets) {
    const style = `<style>${escapeStyleContent(stylesheet.source)}</style>`;
    for (const tag of stylesheetTags(fileName)) {
      next = replaceLiteral(next, tag, style);
    }
  }
  return next;
}

/**
Inlines generated JavaScript chunks into HTML source.
@param source - HTML source
@param scripts - generated JavaScript chunks
*/
function inlineScripts(
  source: string,
  scripts: readonly [string, BundleChunk][],
): string {
  let next = source;
  for (const [fileName, script] of scripts) {
    const moduleScript = `<script type="module">${escapeScriptContent(
      script.code,
    )}</script>`;
    for (const tag of scriptTags(fileName)) {
      next = replaceLiteral(next, tag, moduleScript);
    }
  }
  return next;
}

/**
Inlines generated CSS and JavaScript references into HTML assets. Inlining
removes the external stylesheet/script requests that Lighthouse flags as
render-blocking and as a network-dependency chain.
@param bundle - generated bundle map
*/
function inlineHtmlReferences(bundle: BuildBundle): void {
  const stylesheets = textAssets(bundle, ".css");
  const scripts = scriptChunks(bundle);
  for (const [, html] of textAssets(bundle, ".html")) {
    html.source = inlineScripts(
      inlineStylesheets(html.source, stylesheets),
      scripts,
    );
  }
}

/**
Creates the production-only asset inlining plugin.
*/
function inlineBuildAssets(): Plugin {
  return {
    name: "inline-build-assets",
    apply: "build",
    enforce: "post",
    generateBundle(outputOptions, outputBundle): void {
      // Inlining only applies to the standard ES-module build the app ships.
      if (outputOptions.format !== "es") {
        return;
      }
      inlineHtmlReferences(outputBundle);
    },
  };
}

export default defineConfig({
  root: frontendRoot,
  plugins: [inlineBuildAssets()],
});
