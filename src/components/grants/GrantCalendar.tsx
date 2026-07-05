import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, CalendarDays, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Grant {
  id: string;
  title: string;
  deadline: string;
  status: string;
  funder?: string;
}

interface GrantCalendarProps {
  grants: Grant[];
  onGrantClick?: (grant: Grant) => void;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-emerald-500",
  closing_soon: "bg-amber-500",
  closed: "bg-red-500",
  draft: "bg-slate-400",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatMonth(year: number, month: number) {
  return new Date(year, month).toLocaleString("en-CA", { month: "long", year: "numeric" });
}

function generateICS(grants: Grant[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IIAL//Grant Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const grant of grants) {
    if (!grant.deadline) continue;
    const dt = grant.deadline.split("T")[0].replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;VALUE=DATE:${dt}`,
      `DTEND;VALUE=DATE:${dt}`,
      `SUMMARY:${grant.title}`,
      `DESCRIPTION:${grant.funder ? `Funder: ${grant.funder}\\n` : ""}Status: ${grant.status}`,
      `UID:${grant.id}@iial-grants`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(grants: Grant[]) {
  const ics = generateICS(grants);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "iial-grant-deadlines.ics";
  a.click();
  URL.revokeObjectURL(url);
}

export function GrantCalendar({ grants, onGrantClick }: GrantCalendarProps) {
  const today = new Date();
  const [viewDate, setViewDate] = useState([today.getFullYear(), today.getMonth()]);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const daysInMonth = getDaysInMonth(viewDate[0], viewDate[1]);
  const firstDay = getFirstDayOfMonth(viewDate[0], viewDate[1]);

  const grantsByDate = useMemo(() => {
    const map: Record<string, Grant[]> = {};
    for (const grant of grants) {
      if (!grant.deadline) continue;
      const dateKey = grant.deadline.split("T")[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(grant);
    }
    return map;
  }, [grants]);

  const prevMonth = () => {
    if (viewDate[1] === 0) setViewDate([viewDate[0] - 1, 11]);
    else setViewDate([viewDate[0], viewDate[1] - 1]);
  };

  const nextMonth = () => {
    if (viewDate[1] === 11) setViewDate([viewDate[0] + 1, 0]);
    else setViewDate([viewDate[0], viewDate[1] + 1]);
  };

  const goToToday = () => {
    setViewDate([today.getFullYear(), today.getMonth()]);
  };

  // Week view: get the week containing the first of the viewed month
  const weekStartDay = firstDay;
  const weekDays: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = i - weekStartDay + 1;
    if (d < 1 || d > daysInMonth) weekDays.push(0);
    else weekDays.push(d);
  }

  const renderDayCell = (day: number, dateKey: string, isToday: boolean) => {
    const dayGrants = grantsByDate[dateKey] || [];
    return (
      <div
        key={dateKey}
        className={`min-h-[80px] rounded-md border p-1 text-left transition-colors hover:bg-accent/50 ${
          isToday ? "border-primary bg-primary/5" : "border-border/50"
        }`}
      >
        <div
          className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}
        >
          {day}
        </div>
        <div className="mt-1 space-y-0.5">
          {dayGrants.slice(0, 2).map((grant) => (
            <button
              key={grant.id}
              onClick={() => onGrantClick?.(grant)}
              className="flex w-full items-center gap-1 rounded bg-accent/80 px-1 py-0.5 text-left text-[10px] leading-tight transition-colors hover:bg-accent"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_COLORS[grant.status] || "bg-slate-400"}`}
              />
              <span className="truncate">{grant.title}</span>
            </button>
          ))}
          {dayGrants.length > 2 && (
            <div className="text-[10px] text-muted-foreground">+{dayGrants.length - 2} more</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg font-semibold">
            {formatMonth(viewDate[0], viewDate[1])}
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToToday}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as "month" | "week")}
            size="sm"
          >
            <ToggleGroupItem value="month" className="h-7 px-2 text-xs">
              <CalendarDays className="mr-1 h-3 w-3" />
              Month
            </ToggleGroupItem>
            <ToggleGroupItem value="week" className="h-7 px-2 text-xs">
              <CalendarRange className="mr-1 h-3 w-3" />
              Week
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => downloadICS(grants)}
          >
            <Download className="h-3 w-3" />
            .ics
          </Button>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-px text-center text-xs">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-2 font-medium text-muted-foreground">
              {day}
            </div>
          ))}
          {viewMode === "month"
            ? (() => {
                const cells: React.ReactNode[] = [];
                for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                for (let d = 1; d <= daysInMonth; d++) {
                  const dateKey = `${viewDate[0]}-${String(viewDate[1] + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const isToday =
                    d === today.getDate() &&
                    viewDate[1] === today.getMonth() &&
                    viewDate[0] === today.getFullYear();
                  cells.push(renderDayCell(d, dateKey, isToday));
                }
                return cells;
              })()
            : weekDays.map((d, i) => {
                if (d === 0) return <div key={`week-empty-${i}`} />;
                const dateKey = `${viewDate[0]}-${String(viewDate[1] + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const isToday =
                  d === today.getDate() &&
                  viewDate[1] === today.getMonth() &&
                  viewDate[0] === today.getFullYear();
                return renderDayCell(d, dateKey, isToday);
              })}
        </div>
      </CardContent>
    </Card>
  );
}
