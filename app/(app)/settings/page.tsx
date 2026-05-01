"use client";

import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" subtitle="Workspace preferences" />
      <div className="px-5 lg:px-8 py-5">
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            More workspace settings coming soon. For now, edit your profile from
            the sidebar.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
