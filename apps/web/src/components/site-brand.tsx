import Image from "next/image";
import Link from "next/link";
import logo from "../app/icon.png";

export function SiteBrand({ href = "/" }: { href?: string }) {
  const BrandLink = href.startsWith("#") ? "a" : Link;

  return (
    <BrandLink href={href} className="inline-flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
      <Image src={logo} alt="" width={32} height={32} className="size-8 shrink-0" unoptimized />
      AyiNou
    </BrandLink>
  );
}
