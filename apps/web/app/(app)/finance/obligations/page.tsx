import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function FinanceObligationsPage(){
  return <EnterpriseDataPage eyebrow="Finans Yönetimi" title="Finansal Yükümlülükler" description="Gelecek ve mevcut ödeme yükümlülüklerini, takvimi ve tekrarlayan kuralları izleyin." sections={[
    {title:"Yükümlülükler",path:"/finance/obligations?limit=250"},
    {title:"Ödeme Takvimi",path:"/finance/obligations/calendar"},
    {title:"Takvim Kayıtları",path:"/finance/obligations/calendar/entries?from=2026-08-26&to=2026-10-25&limit=250"},
    {title:"Tekrarlayan Kurallar",path:"/finance/obligations/rules?limit=250"},
  ]} forms={[
    {title:"Yeni Yükümlülük",description:"Kira, vergi, SGK, leasing, abonelik veya benzeri ödeme yükümlülüğü oluşturun.",path:"/finance/obligations",fields:[
      {name:"obligationType",label:"Yükümlülük Türü",required:true,placeholder:"KİRA, VERGİ, SGK, LEASING..."},
      {name:"title",label:"Başlık",required:true},
      {name:"counterparty",label:"Karşı Taraf"},
      {name:"amount",label:"Tutar",type:"number",required:true},
      {name:"currency",label:"Para Birimi",defaultValue:"TRY",required:true},
      {name:"dueDate",label:"Vade Tarihi",type:"date",required:true},
      {name:"priority",label:"Öncelik",type:"select",defaultValue:"NORMAL",options:[{value:"LOW",label:"Düşük"},{value:"NORMAL",label:"Normal"},{value:"HIGH",label:"Yüksek"},{value:"CRITICAL",label:"Kritik"}]},
      {name:"description",label:"Açıklama",type:"textarea"},
    ]},
    {title:"Ödeme Tahsisi Yap",description:"Kaydedilmiş gider ödemesini finansal yükümlülüğe tahsis edin.",path:"/finance/obligations/{id}/payment-allocations",fields:[
      {name:"id",label:"Yükümlülük ID",required:true},
      {name:"expensePaymentId",label:"Gider Ödeme ID",required:true},
      {name:"amount",label:"Tahsis Tutarı",type:"number"},
    ]},
    {title:"Ödeme Tahsisini Geri Al",path:"/finance/obligations/{id}/payment-allocations/{allocationId}/reverse",fields:[
      {name:"id",label:"Yükümlülük ID",required:true},
      {name:"allocationId",label:"Tahsis ID",required:true},
      {name:"reason",label:"Geri Alma Nedeni",type:"textarea",required:true},
    ]},
    {title:"Tekrarlayan Kural Oluştur",description:"Düzenli kira, abonelik veya benzeri yükümlülükleri otomatik üretin.",path:"/finance/obligations/rules/create",fields:[
      {name:"name",label:"Kural Adı",required:true},
      {name:"obligationType",label:"Yükümlülük Türü",required:true},
      {name:"counterparty",label:"Karşı Taraf"},
      {name:"amount",label:"Tutar",type:"number",required:true},
      {name:"currency",label:"Para Birimi",defaultValue:"TRY",required:true},
      {name:"frequency",label:"Sıklık",type:"select",required:true,defaultValue:"MONTHLY",options:[{value:"WEEKLY",label:"Haftalık"},{value:"MONTHLY",label:"Aylık"},{value:"QUARTERLY",label:"Üç Aylık"},{value:"YEARLY",label:"Yıllık"}]},
      {name:"intervalCount",label:"Tekrar Aralığı",type:"number",defaultValue:"1",required:true},
      {name:"dayOfMonth",label:"Ayın Günü",type:"number"},
      {name:"startDate",label:"Başlangıç Tarihi",type:"date",required:true},
      {name:"priority",label:"Öncelik",type:"select",defaultValue:"NORMAL",options:[{value:"LOW",label:"Düşük"},{value:"NORMAL",label:"Normal"},{value:"HIGH",label:"Yüksek"},{value:"CRITICAL",label:"Kritik"}]},
      {name:"description",label:"Açıklama",type:"textarea"},
    ]},
  ]} actions={[
    {label:"Vade Durumlarını Güncelle",path:"/finance/obligations/calendar/refresh-statuses",success:"Yükümlülük vade durumları güncellendi."},
  ]}/>;
}
