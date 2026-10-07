import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defineConfig,
  transformWithEsbuild,
  type HtmlTagDescriptor,
  type Plugin,
} from "vite";

const frontendRoot = fileURLToPath(new URL("../frontend", import.meta.url));

// The Content-Security-Policy the site must ship. It is PINNED here, in a
// harness-owned (FORBIDDEN) file, so a loop agent editing frontend/ cannot
// weaken or remove it. Vercel could set an HTTP header, but the policy is
// delivered via <meta http-equiv> so it travels with the built HTML regardless
// of host (OWASP-sanctioned fallback). Pure 'self' with no hashes/nonces: every
// executable script/style must be an external same-origin file. `harness/
// csp.test.ts` asserts this exact string is present on every built page AND that
// no page carries inline JS/CSS — the tamper-resistant gate. JSON-LD
// (application/ld+json) is data, not script, so `script-src 'self'` does not
// block it.
export const CSP_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'";

// Injects the pinned CSP as a <meta> tag at the very top of <head> on every
// built page. Vite's transformIndexHtml fires once per HTML entry, so all build
// inputs get the policy. `head-prepend` places the meta before any
// resource-referencing tag, as CSP requires.
/**
Creates the CSP-meta injection plugin.
*/
export function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    // Build-only: in dev, Vite injects CSS through inline <style> tags for HMR,
    // which `style-src 'self'` would block, blanking every computed style. The
    // pinned CSP only needs to travel with the *built* HTML, so scope it there.
    apply: "build",
    transformIndexHtml: (): HtmlTagDescriptor[] => {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: CSP_POLICY,
          },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// Injects a matching `<link rel="preload" as="style">` immediately before every
// `<link rel="stylesheet" href="/styles/...">` so the browser starts fetching the
// CSS at parse time in parallel with the module script, keeping the stylesheet out
// of the HTML -> JS -> CSS request chain that Lighthouse's network-dependency
// insight flags. Runs post so it sees the final built HTML.
/**
Creates the stylesheet-preload injection plugin.
*/
export function stylePreload(): Plugin {
  const stylesheet =
    /<link rel="stylesheet" href="(\/styles\/[\w-]+\.css)"\s*\/?>/g;
  return {
    name: "style-preload",
    transformIndexHtml: {
      order: "post",
      handler: (html: string): string => {
        return html.replaceAll(
          stylesheet,
          (link, href: string) =>
            `<link rel="preload" as="style" href="${href}">${link}`,
        );
      },
    },
  };
}

// Rewrites the emitted entry `<script type="module" crossorigin>` to a classic
// `<script defer>`. The IIFE bundle needs no module semantics, and a deferred
// classic script is low-priority, so it drops off the document's critical
// request chain (Lighthouse's network-dependency insight flags an ES-module
// entry as a document dependency). Runs post to see the final built tag.
/**
Creates the classic-defer entry-script plugin.
*/
export function classicDeferEntry(): Plugin {
  const moduleAttributes = /<script type="module" crossorigin src=/g;
  return {
    name: "classic-defer-entry",
    transformIndexHtml: {
      order: "post",
      handler: (html: string): string =>
        html.replaceAll(moduleAttributes, "<script defer src="),
    },
  };
}

// 404.html carries no JS, so it can't be a rollup input alongside the IIFE
// single-JS-entry index. It's emitted here with the same head injections the
// other pages get: the pinned CSP meta and the stylesheet preload.
/**
Creates the 404-page emit plugin.
*/
export function emit404(): Plugin {
  const source = path.join(frontendRoot, "404.html");
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}">`;
  const stylesheet =
    /<link rel="stylesheet" href="(\/styles\/[\w-]+\.css)"\s*\/?>/g;
  let outDirectory = "";
  return {
    name: "emit-404",
    apply: "build",
    configResolved(config): void {
      outDirectory = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle(): Promise<void> {
      const html = await readFile(source, "utf8");
      const withCsp = html.replaceAll(
        "<head>",
        (head: string): string => `${head}${cspTag}`,
      );
      const withPreload = withCsp.replaceAll(
        stylesheet,
        (link: string, href: string): string =>
          `<link rel="preload" as="style" href="${href}">${link}`,
      );
      await writeFile(path.join(outDirectory, "404.html"), withPreload);
    },
  };
}

// public/ assets are copied verbatim and skip Vite's minifier, so this build-only
// plugin minifies the emitted stylesheet in place; otherwise the unminified-css
// audit flags the savings.
/**
Creates the public-stylesheet minification plugin.
*/
export function minifyPublicCss(): Plugin {
  let cssFile = "";
  return {
    name: "minify-public-css",
    apply: "build",
    configResolved(config): void {
      cssFile = path.join(
        path.resolve(config.root, config.build.outDir),
        "styles",
        "styles.css",
      );
    },
    async closeBundle(): Promise<void> {
      const source = await readFile(cssFile, "utf8");
      const { code } = await transformWithEsbuild(source, cssFile, {
        loader: "css",
        minify: true,
      });
      await writeFile(cssFile, code);
    },
  };
}

export default defineConfig({
  root: frontendRoot,
  plugins: [
    cspMeta(),
    stylePreload(),
    classicDeferEntry(),
    emit404(),
    minifyPublicCss(),
  ],
  build: {
    rollupOptions: {
      // index is the sole rollup input so its single JS entry can output as a
      // classic IIFE (loaded as a low-priority defer script, see
      // classicDeferEntry). 404.html has no JS and is emitted by emit404().
      input: {
        index: path.join(frontendRoot, "index.html"),
      },
      output: {
        format: "iife",
      },
    },
  },
});
