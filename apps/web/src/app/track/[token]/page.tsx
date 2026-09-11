import { TrackingView } from "@/components/tracking-view";

export const dynamic = "force-dynamic";

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <TrackingView token={token} />;
}
