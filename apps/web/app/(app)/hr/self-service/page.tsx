import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HRSelfServicePage(){return <EnterpriseDataPage eyebrow="Çalışan Deneyimi" title="Çalışan Self Servis" description="Çalışanın kendi İK özeti ve yönetici görünümünü tek merkezden sunar." sections={[
{title:"Benim İK Özetim",path:"/hr/self-service/me"},
{title:"Yönetici Ekibi",path:"/hr/self-service/manager"},
]} />;}
