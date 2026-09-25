import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HROperationsControlPage(){return <EnterpriseDataPage eyebrow="İnsan Kaynakları · Operasyon" title="İK Operasyon Kontrolü" description="Zimmet, politika, aksiyon ve operasyon kayıtlarını merkezi olarak izleyin." sections={[
{title:"Zimmet ve Varlıklar",path:"/hr/operations/assets"},
{title:"İK Aksiyon Kutusu",path:"/hr/operations/inbox"},
]} />;}
