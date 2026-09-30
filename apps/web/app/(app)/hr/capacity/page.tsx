import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HRCapacityPage(){return <EnterpriseDataPage eyebrow="İnsan Kaynakları · İş Gücü" title="Ekip Kapasitesi" description="Mevcut çalışan kapasitesiyle hizmet ihtiyacını karşılaştırın ve yoğunluk oluşabilecek alanları görün." sections={[
{title:"Çalışan Kapasitesi",path:"/hr/workforce/capacity?from=2026-08-26&to=2026-10-25"},
{title:"Hizmet İhtiyacı",path:"/hr/workforce/capacity/services?from=2026-08-26&to=2026-10-25"},
]} />;}
