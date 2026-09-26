import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HROperationsControlPage(){return <EnterpriseDataPage eyebrow="İnsan Kaynakları · Operasyon" title="İK Operasyon Kontrolü" description="Zimmet, politika, aksiyon ve operasyon kayıtlarını merkezi olarak izleyin." sections={[
{title:"Zimmet ve Varlıklar",path:"/hr/operations/assets"},
{title:"İK Aksiyon Kutusu",path:"/hr/operations/inbox"},
]} forms={[
{title:"Zimmet Varlığı Oluştur",path:"/hr/operations/assets",fields:[{name:"assetType",label:"Varlık Türü",required:true},{name:"name",label:"Varlık Adı",required:true},{name:"branchId",label:"Şube ID"},{name:"assetTag",label:"Zimmet / Etiket No"},{name:"serialNumber",label:"Seri No"}]},
{title:"Varlık Ata",path:"/hr/operations/assets/{assetId}/assign",fields:[{name:"assetId",label:"Varlık ID",required:true},{name:"staffId",label:"Personel ID",required:true},{name:"condition",label:"Teslim Durumu",type:"textarea"}]},
{title:"Zimmeti İade Al",path:"/hr/operations/asset-assignments/{assignmentId}/return",fields:[{name:"assignmentId",label:"Zimmet Atama ID",required:true},{name:"condition",label:"İade Durumu",type:"textarea"}]},
{title:"İK Politikası Yayınla",path:"/hr/operations/policies",fields:[{name:"title",label:"Politika Başlığı",required:true},{name:"version",label:"Versiyon",required:true},{name:"category",label:"Kategori"},{name:"contentRef",label:"Doküman Referansı"},{name:"mandatory",label:"Zorunlu",type:"boolean",defaultValue:"true"}]},
{title:"Aksiyon Kaydı Oluştur",path:"/hr/operations/inbox",fields:[{name:"itemType",label:"Aksiyon Türü",required:true},{name:"entityType",label:"Kayıt Türü",required:true},{name:"entityId",label:"Kayıt ID",required:true},{name:"title",label:"Başlık",required:true},{name:"priority",label:"Öncelik",type:"select",defaultValue:"NORMAL",options:[{value:"LOW",label:"Düşük"},{value:"NORMAL",label:"Normal"},{value:"HIGH",label:"Yüksek"},{value:"CRITICAL",label:"Kritik"}]},{name:"dueAt",label:"Termin",type:"datetime-local"},{name:"assigneeId",label:"Sorumlu Kullanıcı ID"}]}
]} />;}
