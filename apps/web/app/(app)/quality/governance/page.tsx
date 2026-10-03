import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function QualityGovernancePage(){return <EnterpriseDataPage eyebrow="Kalite Yönetimi · Yönetişim" title="Kalite Politikaları ve Skorlar" description="Kalite skorları, SLA politikaları ve geciken aksiyonları yönetin." sections={[
{title:"Kalite Skorları",path:"/quality/scores?limit=250"},
{title:"Skor Politikaları",path:"/quality/scores/policies"},
{title:"SLA Politikaları",path:"/quality/sla/policies?limit=250"},
{title:"Geciken Kalite Aksiyonları",path:"/quality/overdue?limit=250"},
]} actions={[
{label:"SLA Politikalarını Uygula",path:"/quality/sla/apply-policies",body:{limit:200},success:"SLA politikaları uygulandı."},
{label:"Geciken Aksiyonları İşle",path:"/quality/overdue/process",body:{limit:200},success:"Geciken kalite aksiyonları işlendi."},
]}/>}
