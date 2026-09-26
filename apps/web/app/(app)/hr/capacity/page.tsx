import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HRCapacityPage(){return <EnterpriseDataPage eyebrow="İnsan Kaynakları · İş Gücü" title="Kapasite ve İş Gücü Analizi" description="Personel kapasitesini ve hizmet bazlı kapasite ihtiyacını karşılaştırın." sections={[
{title:"İş Gücü Kapasitesi",path:"/hr/workforce/capacity?from=2026-08-26&to=2026-10-25"},
{title:"Hizmet Kapasitesi",path:"/hr/workforce/capacity/services?from=2026-08-26&to=2026-10-25"},
]} />;}
