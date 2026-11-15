import { HelperHandoff } from "@/components/trojan/HelperHandoff";
import { SOURCES } from "@/lib/corpus";

export const dynamic = "force-dynamic";

export default async function HelperHandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HelperHandoff id={id} sources={SOURCES} />;
}
