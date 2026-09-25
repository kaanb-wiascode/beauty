import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function FinanceObligationsPage(){
  return <EnterpriseDataPage eyebrow="Finans Yönetimi" title="Finansal Yükümlülükler" description="Gelecek ve mevcut ödeme yükümlülüklerini, takvimi ve tekrarlayan kuralları izleyin." sections={[
    {title:"Yükümlülükler",path:"/finance/obligations?limit=250"},
    {title:"Ödeme Takvimi",path:"/finance/obligations/calendar"},
    {title:"Takvim Kayıtları",path:"/finance/obligations/calendar/entries?from=2026-08-26&to=2026-10-25&limit=250"},
    {title:"Tekrarlayan Kurallar",path:"/finance/obligations/rules?limit=250"},
  ]} actions={[
    {label:"Vade Durumlarını Güncelle",path:"/finance/obligations/calendar/refresh-statuses",success:"Yükümlülük vade durumları güncellendi."},
  ]}/>;
}
