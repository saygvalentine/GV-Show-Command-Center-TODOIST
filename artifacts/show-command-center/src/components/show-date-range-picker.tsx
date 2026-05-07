import { useState } from "react";
import { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ShowDateRangePickerProps {
  startValue: string;
  endValue: string;
  onStartChange: (val: string) => void;
  onEndChange: (val: string) => void;
}

function toDate(val: string): Date | undefined {
  if (!val) return undefined;
  const [y, m, d] = val.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toStr(d: Date | undefined): string {
  if (!d) return "";
  return format(d, "yyyy-MM-dd");
}

export function ShowDateRangePicker({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: ShowDateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const range: DateRange = {
    from: toDate(startValue),
    to: toDate(endValue),
  };

  function handleSelect(selected: DateRange | undefined) {
    const from = selected?.from;
    const to = selected?.to;
    // react-day-picker v9 fires {from, to} both set to the same day on the first click
    // treat a collapsed range as "start selected, waiting for end"
    const sameDay = from && to && from.getTime() === to.getTime();
    onStartChange(toStr(from));
    onEndChange(sameDay ? "" : toStr(to));
    if (from && to && !sameDay) {
      setOpen(false);
    }
  }

  const label = range.from
    ? range.to
      ? `${format(range.from, "MMM d")} → ${format(range.to, "MMM d, yyyy")}`
      : `${format(range.from, "MMM d, yyyy")} → pick end`
    : "Pick show dates";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !range.from && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          numberOfMonths={2}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
