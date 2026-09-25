import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function FinanceConfigurationPage(){
  return <EnterpriseDataPage eyebrow="Finans Yönetimi · Yapılandırma" title="Finans Yapılandırması" description="Gelir/gider kategorileri, muhasebe eşlemeleri, masraf merkezleri ve yapılandırma değişikliklerini tek ekranda izleyin." sections={[
    {title:"Gider Kategorileri",path:"/finance/setup/expense-categories"},
    {title:"Gelir Kategorileri",path:"/finance/setup/income-categories"},
    {title:"Masraf Merkezleri",path:"/finance/setup/cost-centers"},
    {title:"Gider Muhasebe Eşlemeleri",path:"/finance/setup/expense-accounting-mappings"},
    {title:"Gelir Muhasebe Eşlemeleri",path:"/finance/setup/income-accounting-mappings"},
    {title:"Yapılandırma Denetim Geçmişi",path:"/finance/setup/configuration-audit?limit=250"},
  ]}/>;
}
