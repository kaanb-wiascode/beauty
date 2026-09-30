import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function HRSelfServicePage(){return <EnterpriseDataPage eyebrow="Çalışan Deneyimi" title="Çalışan İşlemleri" description="Çalışanların kendi bilgilerini, izinlerini ve yöneticilerin ekip özetini tek merkezden sunar." sections={[
{title:"Benim İnsan Kaynakları Özetim",description:"Kendi çalışma, izin ve insan kaynakları bilgilerinizi görüntüleyin.",path:"/hr/self-service/me"},
{title:"Ekibim",description:"Sorumlu olduğunuz çalışanların temel durumunu görüntüleyin.",path:"/hr/self-service/manager"},
]} forms={[
{title:"İzin Talebi Oluştur",path:"/hr/self-service/me/leave-requests",fields:[{name:"leaveTypeId",label:"İzin Türü",type:"remote-select",optionsPath:"/hr/leave-policies/types",optionLabelKeys:["name"],required:true},{name:"startDate",label:"Başlangıç Tarihi",type:"date",required:true},{name:"endDate",label:"Bitiş Tarihi",type:"date",required:true},{name:"days",label:"Gün",type:"number",required:true},{name:"reason",label:"Açıklama",type:"textarea"}]},
{title:"Çalışan Hesabını Eşleştir",description:"Çalışanın sistem hesabını kendi çalışan kaydıyla eşleştirin.",path:"/hr/self-service/employees/{staffId}/link-user",fields:[{name:"staffId",label:"Çalışan",type:"remote-select",optionsPath:"/hr/employees",optionLabelKeys:["firstName","lastName"],required:true},{name:"userId",label:"Kullanıcı Hesabı",required:true,placeholder:"Bağlanacak kullanıcı hesabını seçin veya girin"}]}
]} />;}
