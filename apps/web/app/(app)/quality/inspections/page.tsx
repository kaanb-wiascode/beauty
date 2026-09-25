import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function QualityInspectionsPage(){return <EnterpriseDataPage eyebrow="Kalite Yönetimi" title="Denetim Yönetimi" description="Denetim şablonlarını, planlanan denetimleri ve kurumsal denetim kataloğunu yönetin." sections={[
{title:"Denetimler",path:"/quality/inspections?limit=250"},
{title:"Denetim Şablonları",path:"/quality/inspections/templates"},
{title:"Kurumsal Denetim Kataloğu",path:"/quality/inspections/catalog"},
]} actions={[
{label:"Hazır Denetim Kataloğunu Kur",path:"/quality/inspections/catalog/install",success:"Denetim kataloğu kuruldu."},
{label:"Vadesi Gelen Denetimleri İşle",path:"/quality/inspections/schedules/process-due",body:{limit:100},success:"Vadesi gelen denetimler işlendi."},
]}/>}
