import { CalendarSync, LogOut, Loader2 } from "lucide-react";
import { useGcal } from "@/contexts/google-calendar-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function GoogleCalendarSettings() {
  const { isConnected, calendarId, calendars, loadingCalendars, connect, disconnect, setCalendarId } =
    useGcal();

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-semibold">Google Calendar</p>
          <p className="text-sm text-muted-foreground">
            {isConnected
              ? "Connected — choose which calendar to sync tasks and e-blasts to."
              : "Connect your Google account to sync tasks and e-blasts to a calendar of your choice."}
          </p>
        </div>
        {isConnected ? (
          <Button variant="outline" size="sm" onClick={disconnect} className="gap-1.5 shrink-0">
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={connect} className="gap-1.5 shrink-0">
            <CalendarSync className="h-3.5 w-3.5" />
            Connect Google Calendar
          </Button>
        )}
      </div>

      {isConnected && (
        <div className="border-t px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium shrink-0">Sync to:</span>
          {loadingCalendars ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Select value={calendarId} onValueChange={setCalendarId}>
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
      )}
    </div>
  );
}
