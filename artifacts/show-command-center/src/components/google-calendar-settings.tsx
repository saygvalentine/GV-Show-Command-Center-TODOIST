import { Loader2 } from "lucide-react";
import { useGcal } from "@/contexts/google-calendar-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function CalendarPicker({
  label,
  value,
  onChange,
  calendars,
  loading,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  calendars: { id: string; summary: string; primary?: boolean }[];
  loading: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium shrink-0 w-20">{label}</span>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-sm max-w-xs">
            <SelectValue placeholder="Pick a calendar" />
          </SelectTrigger>
          <SelectContent>
            {calendars.map((cal) => (
              <SelectItem key={cal.id} value={cal.id}>
                {cal.summary}
                {cal.primary ? " (primary)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export function GoogleCalendarSettings() {
  const {
    taskCalendarId,
    eblastCalendarId,
    calendars,
    loadingCalendars,
    setTaskCalendarId,
    setEblastCalendarId,
  } = useGcal();

  return (
    <div className="rounded-lg border">
      <div className="px-4 py-3">
        <p className="font-semibold">Google Calendar</p>
        <p className="text-sm text-muted-foreground">
          Choose which calendars to sync tasks and e-blasts to.
        </p>
      </div>
      <div className="border-t px-4 py-3 space-y-2.5">
        <CalendarPicker
          label="Tasks →"
          value={taskCalendarId}
          onChange={setTaskCalendarId}
          calendars={calendars}
          loading={loadingCalendars}
        />
        <CalendarPicker
          label="e-Blasts →"
          value={eblastCalendarId}
          onChange={setEblastCalendarId}
          calendars={calendars}
          loading={loadingCalendars}
        />
      </div>
    </div>
  );
}
