import { DiscoverScreen } from "@/components/discover-screen";

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <DiscoverScreen initial={view === "institutions" || view === "following" ? view : "people"} />;
}
