/// <reference types="@vite-pwa/astro/client" />

declare module "virtual:pwa-info" {
  export const pwaInfo: {
    webManifest: {
      href: string;
      useCredentials?: boolean;
      linkTag: string;
    };
    registerSW?: {
      inline: boolean;
      mode: string;
      scope: string;
      script?: string;
    };
  };
}

declare module "virtual:pwa-assets/head" {
  export const pwaAssetsHead: {
    links: Record<string, string>[];
    themeColor?: {
      content: string;
      media?: string;
    };
  };
}

declare module "virtual:pwa-register" {
  import type { RegisterSWOptions } from "vite-plugin-pwa/types";

  export type { RegisterSWOptions };
  export function registerSW(
    options?: RegisterSWOptions
  ): (reloadPage?: boolean) => Promise<void>;
}
