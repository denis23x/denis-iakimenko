import { visit } from "unist-util-visit";

type Tree = Parameters<typeof visit>[0];

type RehypeElementNode = {
  tagName?: string;
  properties?: {
    href?: unknown;
    rel?: string[];
    target?: string;
  };
};

export default function rehypeLinkPolicy() {
  const trusted = [
    "supabase.com",
    "docker.com",
    "coolify.io",
    "postman.com",
    "apidog.com",
    "google.com",
    "developers.google.com",
    "mozilla.org",
    "developer.mozilla.org",
    "plausible.io",
  ];
  const sponsored: string[] = [];

  return (tree: Tree) => {
    visit(tree, "element", (node: RehypeElementNode) => {
      if (node.tagName !== "a") return;

      const properties = node.properties;
      if (!properties) return;

      const href = properties.href;
      if (typeof href !== "string") return;

      if (
        href.startsWith("/") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;

      let host = "";

      try {
        host = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        return;
      }

      if (sponsored.includes(host)) {
        properties.rel = ["sponsored"];
        return;
      }

      if (!trusted.includes(host)) {
        properties.rel = ["nofollow", "noopener"];
        properties.target = "_blank";
        return;
      }
    });
  };
}
