import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HRShiftExchangesPage(){return <EnterpriseDataPage eyebrow="İnsan Kaynakları · İş Gücü" title="Vardiya Değişimleri" description="Vardiya takas taleplerini ve açık vardiya süreçlerini izleyin." sections={[{title:"Vardiya Takasları",path:"/hr/workforce/exchange/swaps"}]} forms={[
{title:"Vardiya Takası Talep Et",path:"/hr/workforce/exchange/assignments/{assignmentId}/swaps",fields:[{name:"assignmentId",label:"Vardiya Atama ID",required:true},{name:"targetStaffId",label:"Hedef Personel ID"},{name:"note",label:"Talep Notu",type:"textarea"}]},
{title:"Takas Talebini İncele",path:"/hr/workforce/exchange/swaps/{id}/review",fields:[{name:"id",label:"Takas Talep ID",required:true},{name:"approve",label:"Onay",type:"boolean",defaultValue:"true"},{name:"note",label:"Yönetici Notu",type:"textarea"}]}
]} />;}
