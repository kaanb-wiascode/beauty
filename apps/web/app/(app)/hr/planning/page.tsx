import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HRPlanningPage(){return <EnterpriseDataPage eyebrow="İnsan Kaynakları" title="İK Planlama" description="Headcount planları, seyahat talepleri ve çalışan anketlerini yönetsel görünümde izleyin." sections={[
{title:"Headcount Planı",path:"/hr/planning/headcount?periodMonth=2026-09-01"},
{title:"Seyahat ve Görevlendirmeler",path:"/hr/planning/travel"},
{title:"İK Anketleri",path:"/hr/planning/surveys"},
]} />;}
