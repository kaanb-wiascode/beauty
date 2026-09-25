import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HRPlanningPage(){return <EnterpriseDataPage eyebrow="İnsan Kaynakları" title="İK Planlama" description="Headcount planları, seyahat talepleri ve çalışan anketlerini yönetsel görünümde izleyin." sections={[
{title:"Headcount Planı",path:"/hr/planning/headcount?periodMonth=2026-09-01"},
{title:"Seyahat ve Görevlendirmeler",path:"/hr/planning/travel"},
{title:"İK Anketleri",path:"/hr/planning/surveys"},
]} forms={[
{title:"Headcount Planını Kaydet",path:"/hr/planning/headcount",fields:[{name:"periodMonth",label:"Dönem",type:"date",required:true},{name:"targetHeadcount",label:"Hedef Kadro",type:"number",required:true},{name:"plannedHires",label:"Planlanan İşe Alım",type:"number",defaultValue:"0"},{name:"plannedExits",label:"Planlanan Çıkış",type:"number",defaultValue:"0"},{name:"notes",label:"Not",type:"textarea"}]},
{title:"Seyahat / Görevlendirme Talebi",path:"/hr/planning/employees/{staffId}/travel",fields:[{name:"staffId",label:"Personel ID",required:true},{name:"purpose",label:"Amaç",required:true},{name:"destination",label:"Destinasyon",required:true},{name:"startsOn",label:"Başlangıç",type:"date",required:true},{name:"endsOn",label:"Bitiş",type:"date",required:true},{name:"advanceAmount",label:"Avans Tutarı",type:"number",defaultValue:"0"},{name:"currency",label:"Para Birimi",defaultValue:"TRY"}]},
{title:"İK Anketi Oluştur",path:"/hr/planning/surveys",fields:[{name:"name",label:"Anket Adı",required:true},{name:"surveyType",label:"Anket Türü",required:true},{name:"anonymous",label:"Anonim",type:"boolean",defaultValue:"true"},{name:"startsAt",label:"Başlangıç",type:"datetime-local"},{name:"endsAt",label:"Bitiş",type:"datetime-local"},{name:"status",label:"Durum",type:"select",defaultValue:"DRAFT",options:[{value:"DRAFT",label:"Taslak"},{value:"ACTIVE",label:"Aktif"},{value:"CLOSED",label:"Kapalı"}]}]}
]} />;}
