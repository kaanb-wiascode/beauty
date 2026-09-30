import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HROperationsControlPage(){return <EnterpriseDataPage eyebrow="İnsan Kaynakları · Operasyon" title="İK İşlem Takibi" description="Zimmetleri, çalışan politikalarını ve yapılması gereken insan kaynakları işlemlerini tek merkezden takip edin." sections={[
{title:"Zimmet ve Varlıklar",path:"/hr/operations/assets"},
{title:"Yapılacak İşler",path:"/hr/operations/inbox"},
]} forms={[
{title:"Zimmet Varlığı Oluştur",path:"/hr/operations/assets",fields:[{name:"assetType",label:"Varlık Türü",required:true},{name:"name",label:"Varlık Adı",required:true},{name:"branchId",label:"Şube"},{name:"assetTag",label:"Zimmet / Etiket No"},{name:"serialNumber",label:"Seri No"}]},
{title:"Varlık Ata",path:"/hr/operations/assets/{assetId}/assign",fields:[{name:"assetId",label:"Varlık",required:true},{name:"staffId",label:"Çalışan",type:"remote-select",optionsPath:"/hr/employees",optionLabelKeys:["firstName","lastName"],required:true},{name:"condition",label:"Teslim Durumu",type:"textarea"}]},
{title:"Zimmeti İade Al",path:"/hr/operations/asset-assignments/{assignmentId}/return",fields:[{name:"assignmentId",label:"Zimmet Kaydı",required:true},{name:"condition",label:"İade Durumu",type:"textarea"}]},
{title:"Çalışan Politikası Yayınla",path:"/hr/operations/policies",fields:[{name:"title",label:"Politika Başlığı",required:true},{name:"version",label:"Sürüm",required:true},{name:"category",label:"Kategori"},{name:"contentRef",label:"Belge Bağlantısı"},{name:"mandatory",label:"Zorunlu",type:"boolean",defaultValue:"true"}]},
{title:"Yapılacak İş Ekle",path:"/hr/operations/inbox",fields:[{name:"itemType",label:"İşlem Türü",required:true},{name:"entityType",label:"Kayıt Türü",required:true},{name:"entityId",label:"İlgili Kayıt",required:true},{name:"title",label:"Başlık",required:true},{name:"priority",label:"Öncelik",type:"select",defaultValue:"NORMAL",options:[{value:"LOW",label:"Düşük"},{value:"NORMAL",label:"Normal"},{value:"HIGH",label:"Yüksek"},{value:"CRITICAL",label:"Kritik"}]},{name:"dueAt",label:"Termin",type:"datetime-local"},{name:"assigneeId",label:"Sorumlu Kullanıcı"}]}
]} />;}
