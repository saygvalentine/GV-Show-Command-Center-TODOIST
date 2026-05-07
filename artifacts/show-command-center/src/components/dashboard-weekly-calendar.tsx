import { useMemo } from "react";
import { Link } from "wouter";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  format,
  addWeeks,
  subWeeks,
  getMonth,
  getYear,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetCalendarEvents } from "@workspace/api-client-react";
import { parseDateStr, getCategoryColor } from "@/lib/date-utils";

const CATEGORY_COLORS: Record<string, string> = {
  "Fire Marshal":       "bg-blue-400/70 text-black border border-blue-400/50",
  "ID Sign":            "bg-purple-400/70 text-black border border-purple-400/50",
  "Warehouse Manifest": "bg-orange-400/70 text-black border border-orange-400/50",
  "Show Bucket":        "bg-yellow-400/70 text-black border border-yellow-400/50",
  "Vehicle Spotting":   "bg-green-400/70 text-black border border-green-400/50",
  "Electrical":         "bg-red-400/70 text-black border border-red-400/50",
  "eblast":             "bg-pink-400/70 text-black border border-pink-400/50",
};

function chipColor(category: string | null | undefined, type: string): string {
  if (type === "eblast") return CATEGORY_COLORS["eblast"];
  return CATEGORY_COLORS[category ?? ""] ?? "bg-muted text-muted-foreground border border-border";
}

interface Props {
  weekOffset: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function DashboardWeeklyCalendar({ weekOffset, onPrev, onNext, onToday }: Props) {
  const baseDate = useMemo(() => {
    if (weekOffset === 0) return new Date();
    return weekOffset > 0
      ? addWeeks(new Date(), weekOffset)
      : subWeeks(new Date(), Math.abs(weekOffset));
  }, [weekOffset]);

  const days = useMemo(() => {
    const start = startOfWeek(baseDate, { weekStartsOn: 1 });
    const end   = endOfWeek(baseDate,   { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [baseDate]);

  // The week might span two different months — fetch both if needed.
  const startMonth = getMonth(days[0]) + 1;
  const startYear  = getYear(days[0]);
  const endMonth   = getMonth(days[days.length - 1]) + 1;
  const endYear    = getYear(days[days.length - 1]);
  const spansTwo   = startMonth !== endMonth || startYear !== endYear;

  const { data: eventsA, isLoading: loadingA } = useGetCalendarEvents({
    month: startMonth,
    year:  startYear,
  });
  const { data: eventsB, isLoading: loadingB } = useGetCalendarEvents(
    { month: endMonth, year: endYear },
    { query: { enabled: spansTwo } },
  );

  const isLoading = loadingA || (spansTwo && loadingB);

  const eventsByDay = useMemo(() => {
    const allEvents = [
      ...(eventsA ?? []),
      ...(spansTwo ? (eventsB ?? []) : []),
    ].filter(e => e.type === "task" || e.type === "eblast");

    const map = new Map<string, typeof allEvents>();
    days.forEach(d => map.set(format(d, "yyyy-MM-dd"), []));

    for (const ev of allEvents) {
      const key = ev.date; // already "YYYY-MM-DD"
      if (map.has(key)) map.get(key)!.push(ev);
    }
    return map;
  }, [eventsA, eventsB, days, spansTwo]);

  const weekLabel = useMemo(() => {
    const start = days[0];
    const end   = days[days.length - 1];
    if (format(start, "MMM yyyy") === format(end, "MMM yyyy")) {
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    }
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }, [days]);

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={onToday} className="text-xs h-7 px-2">
              Today
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day columns */}
      {isLoading ? (
        <Skeleton className="w-full h-28 rounded-lg" />
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {days.map(day => {
            const key    = format(day, "yyyy-MM-dd");
            const events = eventsByDay.get(key) ?? [];
            const today  = isToday(day);

            return (
              <div
                key={key}
                className={`rounded-lg p-2 min-h-[96px] flex flex-col gap-1 ${
                  today
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-muted/30 border border-transparent"
                }`}
              >
                {/* Day header */}
                <div className="flex flex-col items-center mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {format(day, "EEE")}
                  </span>
                  <span className={`text-sm font-bold leading-none ${today ? "text-primary" : "text-foreground"}`}>
                    {format(day, "d")}
                  </span>
                </div>

                {/* Task / e-blast chips */}
                {events.map((ev, i) => (
                  <div key={i}>
                    {ev.showId ? (
                      <Link href={`/shows/${ev.showId}`}>
                        <div
                          className={`rounded px-1 py-0.5 text-[10px] leading-tight font-medium cursor-pointer hover:opacity-80 transition-opacity ${chipColor(ev.category, ev.type)} ${ev.done ? "opacity-40 line-through" : ""}`}
                          title={`${ev.showName ? ev.showName + " — " : ""}${ev.name}${ev.category ? " (" + ev.category + ")" : ""}`}
                        >
                          <div className="truncate">{ev.name}</div>
                          {ev.showName && (
                            <div className="truncate opacity-70">{ev.showName}</div>
                          )}
                        </div>
                      </Link>
                    ) : (
                      <div
                        className={`rounded px-1 py-0.5 text-[10px] leading-tight font-medium ${chipColor(ev.category, ev.type)} ${ev.done ? "opacity-40 line-through" : ""}`}
                        title={ev.name}
                      >
                        <div className="truncate">{ev.name}</div>
                      </div>
                    )}
                  </div>
                ))}

                {events.length === 0 && <div className="flex-1" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border">
        {Object.entries(CATEGORY_COLORS).map(([label, cls]) => (
          <span key={label} className={`text-[10px] rounded px-1.5 py-0.5 font-medium ${cls}`}>
            {label}
          </span>
        ))}
        <span className="text-[10px] rounded px-1.5 py-0.5 font-medium bg-muted text-muted-foreground border border-border">
          Other
        </span>
      </div>
    </div>
  );
}
