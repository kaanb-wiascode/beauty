import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function QualityInspectionsPage(){return <EnterpriseDataPage eyebrow="Kalite Yönetimi" title="Denetim Yönetimi" description="Denetim şablonlarını, planlanan denetimleri ve kurumsal denetim kataloğunu yönetin." sections={[
{title:"Denetimler",path:"/quality/inspections?limit=250"},
{title:"Denetim Şablonları",path:"/quality/inspections/templates"},
{title:"Kurumsal Denetim Kataloğu",path:"/quality/inspections/catalog"},
]} forms={[
{title:"Denetim Başlat",path:"/quality/inspections/{id}/start",fields:[{name:"id",label:"Denetim ID",required:true}]},
{title:"Denetimi Tamamla",path:"/quality/inspections/{id}/complete",fields:[{name:"id",label:"Denetim ID",required:true},{name:"notes",label:"Tamamlama Notu",type:"textarea"}]},
{title:"Denetimi Yeniden Planla",path:"/quality/inspections/{id}/reschedule",fields:[{name:"id",label:"Denetim ID",required:true},{name:"plannedFor",label:"Yeni Tarih",type:"datetime-local",required:true},{name:"inspectorUserId",label:"Denetçi Kullanıcı ID"},{name:"reason",label:"Neden",type:"textarea"}]}
]} actions={[
{label:"Hazır Denetim Kataloğunu Kur",path:"/quality/inspections/catalog/install",success:"Denetim kataloğu kuruldu."},
{label:"Vadesi Gelen Denetimleri İşle",path:"/quality/inspections/schedules/process-due",body:{limit:100},success:"Vadesi gelen denetimler işlendi."},
]}/>}
