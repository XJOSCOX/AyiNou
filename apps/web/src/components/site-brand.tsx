import Link from "next/link";

export function SiteBrand({ href = "/" }: { href?: string }) {
  const BrandLink = href.startsWith("#") ? "a" : Link;

  return (
    <BrandLink href={href} className="inline-flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
      <span aria-hidden="true" className="size-7 rounded-lg bg-[linear-gradient(to_bottom,var(--theme-brand-blue)_67%,var(--theme-brand-red)_67%)]" />
      AyiNou
    </BrandLink>
  );
}
