import { EnterpriseDataPage } from "@/components/enterprise-data-page";
export default function PlatformControlPlanePage(){return <EnterpriseDataPage eyebrow="VALOO Platform Yönetimi" title="SaaS Control Plane" description="Tenant provisioning, abonelik, müşteri başarısı, destek ve entitlement katmanlarını merkezi olarak izleyin." sections={[
{title:"Provisioning Özeti",path:"/platform/provisioning/summary"},
{title:"Provisioning Çalışmaları",path:"/platform/provisioning?limit=100"},
{title:"Paketler ve Planlar",path:"/platform/plans"},
{title:"Müşteri Başarısı",path:"/platform/customer-success?limit=100"},
{title:"Tenant Sağlığı",path:"/platform/customer-success/health?limit=100"},
{title:"Destek Özeti",path:"/platform/support/summary"},
{title:"Destek Talepleri",path:"/platform/support/tickets?limit=100"},
{title:"Entitlement Kataloğu",path:"/platform/entitlements"},
]} />;}
