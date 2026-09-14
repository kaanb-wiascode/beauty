import "../customers-beauty.css";
import { CustomerCrm360 } from "@/components/customer-crm-360";

export default async function CustomerDetailLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  return (
    <>
      {children}
      <div className="mx-auto mt-7 max-w-6xl pb-8">
        <CustomerCrm360 customerId={id} />
      </div>
    </>
  );
}
