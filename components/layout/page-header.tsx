"use client";

import { Topbar } from "@/components/layout/topbar";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle} />
      {children && (
        <div className="px-5 lg:px-8 pt-4 pb-1 flex flex-wrap items-center gap-2 justify-end">
          {children}
        </div>
      )}
    </>
  );
}
