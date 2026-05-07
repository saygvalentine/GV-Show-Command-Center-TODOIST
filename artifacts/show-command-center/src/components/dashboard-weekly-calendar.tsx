import { useMemo } from "react";
import { Link } from "wouter";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  format,
  addWeeks,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDateStr } from "@/lib/date-utils";
import type { ShowResponse } from "@workspace/api-client-react";

interface WeekEvent {
  showId: number;
  showName: string;
  label: string;
  colorClass: string;
}

const EVENT_TYPES: Array<{
  key: keyof ShowResponse;
  label: string;
  colorClass: string;
}> = [
  {
    key: "moveInDate",
    label: "Move-In",
    colorClass:
      "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  },
  {
    key: "showStart",
    label: "Show Start",
    colorClass:
      "bg-green-500/20 text-green-300 border border-green-500/30",
  },
  {
    key: "dismantleDate",
    label: "Dismantle",
    colorClass:
      "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  },
  {
    key: "advanceWarehouseDate",
    label: "Adv. Warehouse",
    colorClass:
      "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  },
  {
    key: "discountDeadline",
    label: "Discount Deadline",
    colorClass:
      "bg-red-500/20 text-red-300 border border-red-500/30",
  },
  {
    key: "onlineOrderDeadline",
    label: "Order Deadline",
    colorClass:
      "bg-amber-500/20 text-amber-300 border border-amber-500/30",
  },
];

interface Props {
  shows: ShowResponse[];
  weekOffset: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function DashboardWeeklyCalendar({
  shows,
  weekOffset,
  onPrev,
  onNext,
  onToday,
}: Props) {
  const baseDate = useMemo(() => {
    const d = new Date();
    if (weekOffset === 0) return d;
    return weekOffset > 0
      ? addWeeks(d, weekOffset)
      : subWeeks(d, Math.abs(weekOffset));
  }, [weekOffset]);

  const days = useMemo(() => {
    const start = startOfWeek(baseDate, { weekStartsOn: 1 }); // Mon
    const end = endOfWeek(baseDate, { weekStartsOn: 1 }); // Sun
    return eachDayOfInterval({ start, end });
  }, [baseDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeekEvent[]>();
    days.forEach((d) => map.set(format(d, "yyyy-MM-dd"), []));

    for (const show of shows) {
      for (const et of EVENT_TYPES) {
        const rawVal = show[et.key];
        if (!rawVal || typeof rawVal !== "string") continue;
        const date = parseDateStr(rawVal);
        const key = format(date, "yyyy-MM-dd");
        if (map.has(key)) {
          map.get(key)!.push({
            showId: show.id,
            showName: show.name,
            label: et.label,
            colorClass: et.colorClass,
          });
        }
      }
    }
    return map;
  }, [shows, days]);

  const weekLabel = useMemo(() => {
    const start = days[0];
    const end = days[days.length - 1];
    if (format(start, "MMM yyyy") === format(end, "MMM yyyy")) {
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    }
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }, [days]);

  const isCurrentWeek = weekOffset === 0;

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{weekLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          {!isCurrentWeek && (
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
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const events = eventsByDay.get(key) ?? [];
          const today = isToday(day);

          return (
            <div
              key={key}
              className={`rounded-lg p-2 min-h-[90px] flex flex-col gap-1 ${
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
                <span
                  className={`text-sm font-bold leading-none ${
                    today ? "text-primary" : "text-foreground"
                  }`}
                >
                  {format(day, "d")}
                </span>
              </div>

              {/* Events */}
              {events.map((ev, i) => (
                <Link key={i} href={`/shows/${ev.showId}`}>
                  <div
                    className={`rounded px-1 py-0.5 text-[10px] leading-tight font-medium cursor-pointer hover:opacity-80 transition-opacity ${ev.colorClass}`}
                    title={`${ev.showName} — ${ev.label}`}
                  >
                    <div className="truncate">{ev.showName}</div>
                    <div className="opacity-75">{ev.label}</div>
                  </div>
                </Link>
              ))}

              {events.length === 0 && (
                <div className="flex-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border">
        {EVENT_TYPES.map((et) => (
          <span key={et.key} className={`text-[10px] rounded px-1.5 py-0.5 font-medium ${et.colorClass}`}>
            {et.label}
          </span>
        ))}
      </div>
    </div>
  );
}
