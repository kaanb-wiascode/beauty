import type { ReactNode } from "react";
import { LeadScoringPanel } from "./lead-scoring-panel";

export default async function CrmLeadDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      {children}
      <LeadScoringPanel leadId={id} />
    </>
  );
}
