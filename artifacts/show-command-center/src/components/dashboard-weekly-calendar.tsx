import { useMemo, useState } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks } from "date-fns";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Link } from "wouter";
import { useGetCalendarEvents } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type ChipStyle = { bg: string; text: string; border: string };

const CATEGORY_STYLES: Record<string, ChipStyle> = {
  "Show Bucket":        { bg: "bg-blue-500/15",    text: "text-blue-400",    border: "border-blue-500/30"    },
  "Fire Marshal":       { bg: "bg-red-500/15",      text: "text-red-400",     border: "border-red-500/30"     },
  "ID Sign":            { bg: "bg-purple-500/15",   text: "text-purple-400",  border: "border-purple-500/30"  },
  "Warehouse Manifest": { bg: "bg-cyan-500/15",     text: "text-cyan-400",    border: "border-cyan-500/30"    },
  "Vehicle Spotting":   { bg: "bg-amber-500/15",    text: "text-amber-400",   border: "border-amber-500/30"   },
  eblast:               { bg: "bg-pink-500/15",     text: "text-pink-400",    border: "border-pink-500/30"    },
};

const DONE_STYLE = "bg-muted/30 text-muted-foreground line-through border-muted/20";

function getChipClass(type: string, category: string | null | undefined, done: boolean): string {
  if (done) return DONE_STYLE;
  const key = type === "eblast" ? "eblast" : (category ?? "");
  const style = CATEGORY_STYLES[key];
  if (!style) return "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return `${style.bg} ${style.text} ${style.border}`;
}

const LEGEND_ITEMS: { label: string; key: string }[] = [
  { label: "Show Bucket",        key: "Show Bucket"        },
  { label: "Fire Marshal",       key: "Fire Marshal"       },
  { label: "ID Sign",            key: "ID Sign"            },
  { label: "Warehouse Manifest", key: "Warehouse Manifest" },
  { label: "Vehicle Spotting",   key: "Vehicle Spotting"   },
  { label: "E-Blast",            key: "eblast"             },
];

export function DashboardWeeklyCalendar() {
  const [open, setOpen] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const baseWeek = startOfWeek(today, { weekStartsOn: 0 });
  const weekStart = addWeeks(baseWeek, weekOffset);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const startMonth = weekStart.getMonth() + 1;
  const startYear = weekStart.getFullYear();
  const endMonth = weekEnd.getMonth() + 1;
  const endYear = weekEnd.getFullYear();
  const crossesMonth = startMonth !== endMonth || startYear !== endYear;

  const { data: events1 } = useGetCalendarEvents(
    { month: startMonth, year: startYear },
    { query: { queryKey: ["weekly-cal", startMonth, startYear] } }
  );
  const { data: events2 } = useGetCalendarEvents(
    { month: endMonth, year: endYear },
    { query: { enabled: crossesMonth, queryKey: ["weekly-cal", endMonth, endYear] } }
  );

  const tasksByDay = useMemo(() => {
    const all = [...(events1 || []), ...(crossesMonth ? (events2 || []) : [])];
    const map: Record<string, typeof all> = {};
    all
      .filter(e => e.type === "task" || e.type === "eblast")
      .forEach(e => {
        if (!map[e.date]) map[e.date] = [];
        map[e.date].push(e);
      });
    return map;
  }, [events1, events2, crossesMonth]);

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const isCurrentWeek = weekOffset === 0;

  const weekLabel = isCurrentWeek
    ? `This Week — ${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`
    : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">{weekLabel}</h2>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(o => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {!isCurrentWeek && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setWeekOffset(0)}>
                Today
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(o => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-border mx-1" />

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="text-xs">{open ? "Hide" : "Show"}</span>
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-0">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-t border-b">
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, today);
                return (
                  <div
                    key={i}
                    className={`py-2 text-center border-r last:border-r-0 ${isToday ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <div className="text-xs font-semibold">{dayLabels[i]}</div>
                    <div className={`text-base font-bold mt-0.5 mx-auto w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                      {format(day, "d")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Task cells */}
            <div className="grid grid-cols-7 divide-x">
              {weekDays.map((day, i) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayItems = tasksByDay[dateStr] || [];
                const isToday = isSameDay(day, today);
                return (
                  <div
                    key={i}
                    className={`min-h-[120px] p-2 pb-3 space-y-1 ${isToday ? "bg-primary/5" : ""}`}
                  >
                    {dayItems.map(item => (
                      <Link
                        key={item.id}
                        href={`/shows/${item.showId}?tab=${item.type === "eblast" ? "eblasts" : "tasks"}`}
                        className={`block text-xs rounded px-1.5 py-1 leading-tight border transition-opacity hover:opacity-75 ${getChipClass(item.type, item.category, item.done ?? false)}`}
                      >
                        <div className="font-medium truncate">{item.name}</div>
                        <div className="text-[10px] opacity-70 truncate">{item.showName}</div>
                      </Link>
                    ))}
                    {dayItems.length === 0 && (
                      <div className="text-[11px] text-muted-foreground/30 text-center pt-6">—</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t">
              <span className="text-[11px] text-muted-foreground/60 font-medium mr-1">Legend:</span>
              {LEGEND_ITEMS.map(({ label, key }) => {
                const s = CATEGORY_STYLES[key];
                return (
                  <span
                    key={key}
                    className={`inline-flex items-center text-[11px] font-medium rounded px-2 py-0.5 border ${s.bg} ${s.text} ${s.border}`}
                  >
                    {label}
                  </span>
                );
              })}
              <span className="inline-flex items-center text-[11px] font-medium rounded px-2 py-0.5 border bg-muted/30 text-muted-foreground border-muted/20 line-through">
                Completed
              </span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
