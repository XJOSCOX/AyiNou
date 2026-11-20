import { PollDetailScreen } from "@/components/polls";
import { notFound } from "next/navigation";

export default async function PollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
  return <PollDetailScreen id={id} />;
}
