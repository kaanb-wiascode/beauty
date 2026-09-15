"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function TrainingCourseLayout({children}:{children:ReactNode}){
  const params=useParams<{courseId:string}>();
  const pathname=usePathname();
  const base=`/training/courses/${params.courseId}`;
  const links=[
    {href:base,label:"İçerik & Assessment",exact:true},
    {href:`${base}/modules`,label:"Modüller"},
    {href:`${base}/practical`,label:"Pratik Rubric"},
  ];

  return <div className="space-y-4">
    <nav className="flex flex-wrap gap-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-2">
      {links.map(link=>{
        const active=link.exact?pathname===link.href:pathname.startsWith(link.href);
        return <Link key={link.href} href={link.href} className={`rounded-[12px] px-3.5 py-2 text-[11px] font-semibold transition ${active?"bg-[var(--accent)] text-white":"text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"}`}>{link.label}</Link>;
      })}
    </nav>
    {children}
  </div>;
}
