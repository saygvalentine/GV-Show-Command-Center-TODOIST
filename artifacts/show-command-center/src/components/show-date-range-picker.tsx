import { useState } from "react";
import { DateRange } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
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
  const d = parseISO(val);
  return isNaN(d.getTime()) ? undefined : d;
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
    onStartChange(toStr(selected?.from));
    onEndChange(toStr(selected?.to));
    if (selected?.from && selected?.to) {
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
