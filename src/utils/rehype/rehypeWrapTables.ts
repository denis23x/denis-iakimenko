import { visit } from "unist-util-visit";

type Tree = Parameters<typeof visit>[0];

type RehypeElementNode = {
  type: "element";
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Array<unknown>;
};

type ParentNode = {
  children?: Array<unknown>;
};

export default function rehypeWrapTables() {
  return (tree: Tree) => {
    visit(
      tree,
      "element",
      (node: RehypeElementNode, index, parent: ParentNode | undefined) => {
        if (node.tagName !== "table") return;
        if (typeof index !== "number" || !parent?.children) return;

        parent.children[index] = {
          type: "element",
          tagName: "div",
          properties: {
            class: "overflow-x-auto my-7",
          },
          children: [node],
        } satisfies RehypeElementNode;
      }
    );
  };
}
