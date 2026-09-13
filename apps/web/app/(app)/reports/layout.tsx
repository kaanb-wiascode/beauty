import "./reports-beauty.css";
import { ReportsSectionNav } from "./reports-section-nav";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <ReportsSectionNav />
      {children}
    </div>
  );
}
