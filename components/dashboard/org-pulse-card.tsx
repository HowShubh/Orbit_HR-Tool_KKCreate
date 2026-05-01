"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import { activeLeavesOnDate } from "@/lib/leave-utils";
import { TODAY } from "@/lib/mock-data";

export function OrgPulseCard() {
  const { leaves, users } = useStore();
  const totalActive = users.filter((u) => u.status === "active").length;
  const todays = activeLeavesOnDate(leaves, TODAY);

  const wfh = todays.filter((l) => l.type === "wfh" || l.type === "compoff_wfh").length;
  const onLeave = todays.filter((l) => l.type === "leave" || l.type === "compoff_leave").length;
  const inOffice = totalActive - wfh - onLeave;

  const data = [
    { name: "In office", value: inOffice, color: "#10b981" },
    { name: "WFH", value: wfh, color: "#3b82f6" },
    { name: "On leave", value: onLeave, color: "#f97316" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Org pulse</CardTitle>
        <div className="text-[11.5px] text-muted-foreground">{totalActive} people</div>
      </CardHeader>
      <CardContent className="flex items-center gap-6">
        <div className="relative h-[140px] w-[140px] shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                innerRadius={48}
                outerRadius={62}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(220 13% 91%)",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-center">
              <div className="text-[22px] font-semibold tabular-nums">{inOffice}</div>
              <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                in office
              </div>
            </div>
          </div>
        </div>
        <ul className="space-y-2 flex-1">
          {data.map((d) => (
            <li
              key={d.name}
              className="flex items-center justify-between text-[12.5px]"
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                {d.name}
              </span>
              <span className="font-semibold tabular-nums">{d.value}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
