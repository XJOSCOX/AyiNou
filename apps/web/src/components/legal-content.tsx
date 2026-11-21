import React from "react";
import type { LegalBlock } from "@/lib/legal/publication";

export function LegalContentBlock({ block }: { block: LegalBlock }) {
  if (block.kind === "paragraph") return <p>{block.text}</p>;
  if (block.kind === "list") return <ul>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
  return <p><a href={block.href} rel={block.href.startsWith("https:") ? "noopener noreferrer" : undefined}>{block.text}</a></p>;
}
