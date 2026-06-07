import { BatchDetailPage } from "@/features/admin/components/redemption/batch-detail-page";

interface PageProps {
  params: Promise<{ batchId: string }>;
}

export default async function AdminBatchDetailRoute(props: PageProps) {
  const { batchId } = await props.params;
  return <BatchDetailPage batchId={batchId} />;
}
