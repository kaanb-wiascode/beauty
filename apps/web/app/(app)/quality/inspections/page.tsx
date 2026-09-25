import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function QualityInspectionsPage(){return <EnterpriseDataPage eyebrow="Kalite Yönetimi" title="Denetim Yönetimi" description="Denetim şablonlarını, planlanan denetimleri ve kurumsal denetim kataloğunu yönetin." sections={[
{title:"Denetimler",path:"/quality/inspections?limit=250"},
{title:"Denetim Şablonları",path:"/quality/inspections/templates"},
{title:"Kurumsal Denetim Kataloğu",path:"/quality/inspections/catalog"},
]} forms={[
{title:"Denetim Planla",path:"/quality/inspections",fields:[{name:"branchId",label:"Şube ID",required:true},{name:"templateId",label:"Şablon ID",required:true},{name:"plannedFor",label:"Planlanan Tarih",type:"datetime-local",required:true},{name:"inspectorUserId",label:"Denetçi Kullanıcı ID"}]},
{title:"Denetim Sonucu Kaydet",path:"/quality/inspections/{id}/results",fields:[{name:"id",label:"Denetim ID",required:true},{name:"templateItemId",label:"Şablon Madde ID",required:true},{name:"outcome",label:"Sonuç",required:true},{name:"numericScore",label:"Sayısal Puan",type:"number"},{name:"note",label:"Not",type:"textarea"}]},
{title:"Denetim Başlat",path:"/quality/inspections/{id}/start",fields:[{name:"id",label:"Denetim ID",required:true}]},
{title:"Denetimi Tamamla",path:"/quality/inspections/{id}/complete",fields:[{name:"id",label:"Denetim ID",required:true},{name:"notes",label:"Tamamlama Notu",type:"textarea"}]},
{title:"Denetimi İptal Et",path:"/quality/inspections/{id}/cancel",fields:[{name:"id",label:"Denetim ID",required:true},{name:"reason",label:"İptal Nedeni",type:"textarea",required:true}]},
{title:"Denetimi Yeniden Planla",path:"/quality/inspections/{id}/reschedule",fields:[{name:"id",label:"Denetim ID",required:true},{name:"plannedFor",label:"Yeni Tarih",type:"datetime-local",required:true},{name:"inspectorUserId",label:"Denetçi Kullanıcı ID"},{name:"reason",label:"Neden",type:"textarea"}]}
]} actions={[
{label:"Hazır Denetim Kataloğunu Kur",path:"/quality/inspections/catalog/install",success:"Denetim kataloğu kuruldu."},
{label:"Vadesi Gelen Denetimleri İşle",path:"/quality/inspections/schedules/process-due",body:{limit:100},success:"Vadesi gelen denetimler işlendi."},
]}/>}
