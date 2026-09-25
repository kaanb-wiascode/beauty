import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HRSelfServicePage(){return <EnterpriseDataPage eyebrow="Çalışan Deneyimi" title="Çalışan Self Servis" description="Çalışanın kendi İK özeti ve yönetici görünümünü tek merkezden sunar." sections={[
{title:"Benim İK Özetim",path:"/hr/self-service/me"},
{title:"Yönetici Ekibi",path:"/hr/self-service/manager"},
]} forms={[
{title:"İzin Talebi Oluştur",path:"/hr/self-service/me/leave-requests",fields:[{name:"leaveTypeId",label:"İzin Türü ID",required:true},{name:"startDate",label:"Başlangıç Tarihi",type:"date",required:true},{name:"endDate",label:"Bitiş Tarihi",type:"date",required:true},{name:"days",label:"Gün",type:"number",required:true},{name:"reason",label:"Açıklama",type:"textarea"}]},
{title:"Personeli Kullanıcıya Bağla",path:"/hr/self-service/employees/{staffId}/link-user",fields:[{name:"staffId",label:"Personel ID",required:true},{name:"userId",label:"Kullanıcı ID",required:true}]}
]} />;}
