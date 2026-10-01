import { EnterpriseDataPage } from "@/components/enterprise-data-page";

export default function CompensationRequestsPage(){
  const now=new Date();
  return (
    <EnterpriseDataPage
      eyebrow="İnsan Kaynakları"
      title="Prim ve Komisyon Talepleri"
      description="Prim ve komisyon taleplerini oluşturun, merkezi onay durumunu izleyin ve yalnız onaylanan kayıtların bordroya aktarılmasını yönetin."
      sections={[
        {
          title:"Talepler",
          description:"Prim ve komisyon taleplerini, onay durumlarını ve bordroya uygulanma bilgisini gösterir.",
          path:`/hr/compensation-requests?year=${now.getFullYear()}&month=${now.getMonth()+1}`,
        },
      ]}
      forms={[
        {
          title:"Yeni Prim / Komisyon Talebi",
          description:"Talep onay zinciri Şube Müdürü → Üst Yönetici → İK → Muhasebe şeklinde ilerler.",
          path:"/hr/compensation-requests",
          success:"Prim/komisyon talebi onaya gönderildi.",
          fields:[
            {name:"staffId",label:"Çalışan",type:"remote-select",optionsPath:"/hr/employees",optionValueKey:"id",optionLabelKeys:["firstName","lastName"],required:true},
            {name:"type",label:"Talep Türü",type:"select",required:true,options:[
              {value:"BONUS",label:"Prim"},
              {value:"COMMISSION",label:"Komisyon"},
            ]},
            {name:"amount",label:"Tutar",type:"number",required:true},
            {name:"year",label:"Bordro Yılı",type:"number",required:true,defaultValue:now.getFullYear()},
            {name:"month",label:"Bordro Ayı",type:"number",required:true,defaultValue:now.getMonth()+1},
            {name:"reason",label:"Talep Açıklaması",type:"textarea",required:true},
          ],
        },
      ]}
    />
  );
}
