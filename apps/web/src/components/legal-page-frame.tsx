import { Navbar } from "./navbar";
import { SiteFooter } from "./site-footer";

export function LegalPageFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col"><Navbar /><main id="top" className="w-full flex-1">{children}</main><SiteFooter /></div>;
}
