import { defineConfig, fontProviders } from "astro/config";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import AstroPWA from "@vite-pwa/astro";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import remarkDirective from "remark-directive";
import remarkCalloutDirectives from "@microflash/remark-callout-directives";
import remarkBeautifulMermaid from "./src/utils/remark/remarkBeautifulMermaid";
import rehypeLinkPolicy from "./src/utils/rehype/rehypeLinkPolicy";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import { SITE } from "./src/config";

// https://astro.build/config
export default defineConfig({
  site: SITE.website,
  trailingSlash: "never",
  build: {
    inlineStylesheets: "always",
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [
    sitemap({
      filter: page => SITE.showArchives || !page.endsWith("/archives"),
      serialize(item) {
        // remove trailing slash from url
        item.url = item.url.replace(/\/+$/, "");
        return item;
      },
    }),
    AstroPWA({
      mode: import.meta.env.MODE as "development" | "production",
      base: "/",
      scope: "/",
      includeAssets: [
        "favicon.ico",
        "favicon.svg",
        "apple-touch-icon.png",
        "mask-icon.svg",
      ],
      registerType: "autoUpdate",
      manifest: {
        name: "denis-iakimenko",
        short_name: "denis-iakimenko",
        start_url: "/",
        display: "standalone",
        background_color: "#transparent",
        theme_color: "transparent",
        lang: "en",
        scope: "/",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      pwaAssets: {
        config: true,
      },
      workbox: {
        globPatterns: ["**/*.{css,js,png|jpg|jpeg|svg|webp,ico,woff2}"],
        globIgnores: ["**/*.map"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
        navigateFallbackAllowlist: [/^\/$/],
        resolveTempFolder: () => path.resolve(process.cwd(), ".sw"),
      },
    }),
  ],
  markdown: {
    remarkPlugins: [
      remarkDirective,
      [
        remarkCalloutDirectives,
        {
          aliases: {
            danger: "deter",
            success: "commend",
            info: "assert",
          },
        },
      ],
      remarkBeautifulMermaid,
      remarkToc,
      [remarkCollapse, { test: "Table of contents" }],
    ],
    rehypePlugins: [rehypeLinkPolicy],
    shikiConfig: {
      // For more themes, visit https://shiki.style/themes
      themes: { light: "min-light", dark: "github-dark-default" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    // eslint-disable-next-line
    // @ts-ignore
    // This will be fixed in Astro 6 with Vite 7 support
    // See: https://github.com/withastro/astro/issues/14030
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["@resvg/resvg-js"],
    },
  },
  image: {
    responsiveStyles: true,
    layout: "constrained",
  },
  fonts: [
    {
      name: "Google Sans Code",
      cssVariable: "--font-google-sans-code",
      provider: fontProviders.google(),
      fallbacks: ["monospace"],
      weights: [300, 400, 500, 600, 700],
      styles: ["normal", "italic"],
    },
  ],
});
