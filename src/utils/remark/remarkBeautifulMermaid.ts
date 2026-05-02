import { renderMermaidSVG } from "beautiful-mermaid";
import { visit } from "unist-util-visit";

type Tree = Parameters<typeof visit>[0];

type CodeNode = {
  type: "code";
  lang?: string | null;
  meta?: string | null;
  value: string;
};

type ParentNode = {
  children?: Array<unknown>;
};

type HtmlNode = {
  type: "html";
  value: string;
};

function removeRemoteFontImports(svg: string) {
  return svg
    .replace(
      /\s*@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=[^']+'\);/g,
      ""
    )
    .replace(
      /text \{ font-family: '[^']+', system-ui, sans-serif; \}/,
      "text { font-family: var(--font-google-sans-code), ui-monospace, monospace; }"
    );
}

function getMermaidCaption(meta?: string | null) {
  if (!meta) return "";

  const match = meta.match(/(?:^|\s)caption=(?:"([^"]*)"|'([^']*)'|(.+))/);
  const caption = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();

  return caption
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function remarkBeautifulMermaid() {
  return (tree: Tree) => {
    visit(
      tree,
      "code",
      (node: CodeNode, index, parent: ParentNode | undefined) => {
        const lang = node.lang?.trim().toLowerCase();
        if (lang !== "mermaid") return;
        if (typeof index !== "number" || !parent?.children) return;

        try {
          const svg = removeRemoteFontImports(
            renderMermaidSVG(node.value, {
              bg: "var(--background)",
              fg: "var(--foreground)",
              // accent: "var(--accent)",
              muted: "var(--x)",
              // line: '#3d59a1',
              // surface: '#292e42',
              // border: "var(--border)",
              padding: 16,
              transparent: true,
            })
          );

          const caption = getMermaidCaption(node.meta);
          const figcaption = caption
            ? `<figcaption class="text-foreground text-sm italic p-1">${caption}</figcaption>`
            : "";

          parent.children[index] = {
            type: "html",
            value: `<figure class="not-prose [&_svg]:border [&_svg]:rounded-md">${svg}${figcaption}</figure>`,
          } satisfies HtmlNode;
        } catch {
          // Keep original mermaid code block when render fails.
        }
      }
    );
  };
}
