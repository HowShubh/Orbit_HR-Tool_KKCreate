"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { teams } from "@/lib/mock-data";

export default function ProfilePage() {
  const { currentUser, users, pushToast } = useStore();
  const manager = users.find((u) => u.id === currentUser.manager_id);
  const [muted, setMuted] = useState(currentUser.notifications_muted ?? false);
  const [phone, setPhone] = useState(currentUser.phone ?? "+91 98XXXXXXXX");

  return (
    <>
      <Topbar title="My Profile" subtitle="What teammates see, plus your preferences" />
      <div className="px-5 lg:px-8 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="relative inline-block">
                <Avatar name={currentUser.full_name} size="xl" />
                <button className="absolute -bottom-1 -right-1 grid place-items-center h-8 w-8 rounded-full bg-card border shadow-sm hover:bg-muted">
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-4 text-[16px] font-semibold tracking-tight">
                {currentUser.full_name}
              </div>
              <div className="text-[12.5px] text-muted-foreground">
                {currentUser.designation}
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
                <Badge variant="muted" className="capitalize">
                  {currentUser.role.replace("_", " ")}
                </Badge>
                {currentUser.team_ids.map((tid) => {
                  const t = teams.find((x) => x.id === tid);
                  return (
                    <Badge
                      key={tid}
                      variant={tid === currentUser.primary_team_id ? "default" : "muted"}
                    >
                      {t?.name}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="text-[14px] font-semibold">Contact</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={currentUser.email} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Manager</Label>
                  <Input value={manager?.full_name ?? "—"} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label>Joined</Label>
                  <Input
                    value={new Date(currentUser.joined_at).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    disabled
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() =>
                    pushToast({
                      title: "Profile saved",
                      body: "Your contact info is up to date",
                      variant: "success",
                    })
                  }
                >
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="text-[14px] font-semibold">Preferences</div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="text-[13.5px] font-medium">Mute notifications</div>
                  <div className="text-[12px] text-muted-foreground">
                    Stop the bell badge and toasts. You'll still see them in the bell list.
                  </div>
                </div>
                <Switch checked={muted} onCheckedChange={(v) => setMuted(Boolean(v))} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
