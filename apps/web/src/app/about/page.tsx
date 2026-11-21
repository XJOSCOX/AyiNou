import { AboutContent } from "@/components/about-content";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main id="top" className="w-full flex-1">
        <AboutContent />
      </main>
      <SiteFooter />
    </div>
  );
}
