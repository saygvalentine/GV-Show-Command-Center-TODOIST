import { useState, useMemo } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, Download, CheckCircle2, Circle, CalendarSync, ListTodo } from "lucide-react";
import { useGetCalendarEvents, useGetCalendarShowDates, useListShows, useUpdateOfficeTask, useSyncTodoist, getListOfficeTasksQueryKey } from "@workspace/api-client-react";
import { useGcal } from "@/contexts/google-calendar-context";
import { useTodoist } from "@/contexts/todoist-context";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(startOfDay(new Date()));
  const [selectedShowId, setSelectedShowId] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<Date | null>(startOfDay(new Date()));
  const [mode, setMode] = useState<"tasks" | "showdates">("tasks");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();
  const showIdParam = selectedShowId !== "all" ? Number(selectedShowId) : undefined;

  const { data: shows } = useListShows();
  const { data: taskEvents, isLoading: taskLoading, refetch: refetchCalendar } = useGetCalendarEvents(
    { month, year, showId: showIdParam },
    { query: { enabled: mode === "tasks", queryKey: ["calendar-events", month, year, selectedShowId] } }
  );
  const { data: showDateEvents, isLoading: showDateLoading } = useGetCalendarShowDates(
    { month, year, showId: showIdParam },
    { query: { enabled: mode === "showdates", queryKey: ["calendar-show-dates", month, year, selectedShowId] } }
  );

  const events = mode === "tasks" ? taskEvents : showDateEvents;
  const isLoading = mode === "tasks" ? taskLoading : showDateLoading;

  const updateOfficeTask = useUpdateOfficeTask();
  const { taskCalendarId, eblastCalendarId } = useGcal();
  const { taskProjectId, eblastProjectId } = useTodoist();
  const [syncing, setSyncing] = useState(false);
  const syncTodoist = useSyncTodoist();

  const handleTodoistSync = () => {
    syncTodoist.mutate(
      {
        params: {
          taskProjectId: taskProjectId || undefined,
          eblastProjectId: eblastProjectId || undefined,
          ...(selectedShowId !== "all" ? { showId: Number(selectedShowId) } : {}),
        },
      },
      {
        onSuccess: (data) => {
          toast({
            title: "Pushed to Todoist",
            description: `${data.created} created, ${data.updated} updated, ${data.deleted} removed`,
          });
        },
        onError: (err) => {
          toast({
            title: "Todoist sync failed",
            description: (err as Error).message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleGcalSync = async () => {
    setSyncing(true);
    try {
      const qs = new URLSearchParams({
        taskCalendarId,
        eblastCalendarId,
        ...(selectedShowId !== "all" ? { showId: selectedShowId } : {}),
      });
      const res = await fetch(`/api/export/google-calendar/sync?${qs}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      const data = await res.json() as { created: number; updated: number; deleted: number };
      toast({
        title: "Synced to Google Calendar",
        description: `${data.created} created, ${data.updated} updated, ${data.deleted} removed`,
      });
    } catch (err) {
      toast({
        title: "Google Calendar sync failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const handleExport = () => {
    const params = new URLSearchParams();
    if (selectedShowId !== "all") params.set("showId", selectedShowId);
    if (mode === "showdates") params.set("mode", "showdates");
    const url = `/api/export/ics${params.toString() ? `?${params}` : ""}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleToggleOfficeTask = (officeTaskId: number, currentDone: boolean) => {
    updateOfficeTask.mutate(
      { taskId: officeTaskId, data: { completed: !currentDone } },
      {
        onSuccess: () => {
          refetchCalendar();
          queryClient.invalidateQueries({ queryKey: getListOfficeTasksQueryKey() });
        },
        onError: () => toast({ title: "Failed to update task", variant: "destructive" }),
      }
    );
  };

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  // Calculate padding days for the first week
  const firstDayOfMonth = startOfMonth(currentDate).getDay();
  const paddingDays = Array.from({ length: firstDayOfMonth }).map((_, i) => i);

  type AnyEvent = {
    id: number;
    type: string;
    showId?: number | null;
    showName?: string | null;
    name: string;
    date: string;
    done?: boolean;
    category?: string | null;
    officeTaskId?: number | null;
  };

  const eventsByDay = useMemo(() => {
    if (!events) return {} as Record<string, AnyEvent[]>;
    const map: Record<string, AnyEvent[]> = {};
    (events as AnyEvent[]).forEach(e => {
      const dateStr = e.date;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(e);
    });
    return map;
  }, [events]);

  const selectedDayEvents = selectedDay ? eventsByDay[format(selectedDay, "yyyy-MM-dd")] || [] : [];

  const getEventColor = (type: string, done?: boolean) => {
    if (done) return "bg-gray-500/20 text-gray-500 line-through border-gray-500/30";
    switch (type) {
      case "movein":       return "bg-primary/20 text-primary border-primary/30";
      case "eblast":       return "bg-pink-500/20 text-pink-500 border-pink-500/30";
      case "task":         return "bg-blue-500/20 text-blue-500 border-blue-500/30";
      case "officetask":   return "bg-purple-500/20 text-purple-500 border-purple-500/30";
      case "advwarehouse": return "bg-amber-500/20 text-amber-600 border-amber-500/30";
      case "discount":     return "bg-green-500/20 text-green-600 border-green-500/30";
      case "orderdeadline":return "bg-violet-500/20 text-violet-600 border-violet-500/30";
      case "showstart":    return "bg-teal-500/20 text-teal-600 border-teal-500/30";
      case "dismantle":    return "bg-rose-500/20 text-rose-600 border-rose-500/30";
      case "showday":      return "bg-teal-500/10 text-teal-500 border-teal-500/20";
      default: return "bg-gray-500/20 text-gray-500 border-gray-500/30";
    }
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case "movein":       return "Move-In";
      case "eblast":       return "E-Blast";
      case "task":         return "Task";
      case "officetask":   return "Office";
      case "advwarehouse": return "Adv. Wh.";
      case "discount":     return "Discount";
      case "orderdeadline":return "Order DL";
      case "showstart":    return "Show Start";
      case "dismantle":    return "Dismantle";
      case "showday":      return "Show";
      default: return type;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 md:p-6 flex flex-col h-full gap-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-32 text-center font-semibold text-lg">
                {format(currentDate, "MMMM yyyy")}
              </div>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <Button
                variant={mode === "tasks" ? "default" : "ghost"}
                className="rounded-none text-sm h-9 px-3"
                onClick={() => setMode("tasks")}
              >
                Task Dates
              </Button>
              <Button
                variant={mode === "showdates" ? "default" : "ghost"}
                className="rounded-none border-l text-sm h-9 px-3"
                onClick={() => setMode("showdates")}
              >
                Show Dates
              </Button>
            </div>

            <Select value={selectedShowId} onValueChange={setSelectedShowId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by Show" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shows</SelectItem>
                {shows?.map(s => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExport} title={selectedShowId === "all" ? "Export all shows to calendar" : "Export selected show to calendar"}>
              <Download className="h-4 w-4 mr-2" />
              Export .ics
            </Button>
            <Button variant="outline" onClick={handleGcalSync} disabled={syncing} title="Sync to Google Calendar">
              {syncing
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <CalendarSync className="h-4 w-4 mr-2" />}
              Sync to Google Calendar
            </Button>
            <Button variant="outline" onClick={handleTodoistSync} disabled={syncTodoist.isPending} title="Push to Todoist">
              {syncTodoist.isPending
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <ListTodo className="h-4 w-4 mr-2" />}
              Push to Todoist
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6 items-start">
          <Card className="lg:col-span-3">
            <CardContent className="p-0">
              <div className="grid grid-cols-7 border-b">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                  <div key={day} className="py-3 text-center text-sm font-semibold text-muted-foreground border-r last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>
              
              {isLoading ? (
                <div className="h-[500px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="grid grid-cols-7 auto-rows-fr">
                  {paddingDays.map(i => (
                    <div key={`pad-${i}`} className="min-h-[100px] p-2 border-r border-b bg-muted/20" />
                  ))}
                  
                  {daysInMonth.map((day, i) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const dayEvents = eventsByDay[dateStr] || [];
                    const isToday = isSameDay(day, new Date());
                    const isSelected = selectedDay && isSameDay(day, selectedDay);
                    
                    return (
                      <div 
                        key={day.toISOString()} 
                        className={`min-h-[100px] p-2 border-b border-r last:border-r-0 cursor-pointer transition-colors hover:bg-muted/50
                          ${!isSameMonth(day, currentDate) ? "bg-muted/20 text-muted-foreground" : ""}
                          ${isSelected ? "ring-2 ring-inset ring-primary bg-primary/5" : ""}
                        `}
                        onClick={() => setSelectedDay(day)}
                      >
                        <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                          {format(day, "d")}
                        </div>
                        
                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 3).map(e => (
                            <div key={`${e.type}-${e.id}`} className={`text-xs px-1.5 py-0.5 rounded truncate border ${getEventColor(e.type, e.done)}`} title={e.name}>
                              {e.name}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-xs text-muted-foreground font-medium px-1">
                              +{dayEvents.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:sticky lg:top-20 h-[500px] flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle>
                {selectedDay ? format(selectedDay, "EEEE, MMMM d") : "Select a day"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex-1 overflow-y-auto space-y-3">
              {!selectedDay ? (
                <div className="text-center text-muted-foreground py-8">
                  Click a day on the calendar to see details
                </div>
              ) : selectedDayEvents.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No items scheduled for this day
                </div>
              ) : (
                selectedDayEvents.map(e => (
                  <div key={`${e.type}-${e.id}`} className="p-3 rounded-lg border bg-card text-card-foreground shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={`uppercase text-[10px] px-1.5 py-0 ${getEventColor(e.type, e.done)}`}>
                            {getEventTypeLabel(e.type)}
                          </Badge>
                          {e.category && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {e.category}
                            </Badge>
                          )}
                        </div>
                        <h4 className={`text-sm font-medium ${e.done ? 'line-through text-muted-foreground' : ''}`}>
                          {e.name}
                        </h4>
                        {e.type !== "officetask" && e.showName && (
                          <Link href={`/shows/${e.showId}`} className="text-xs text-primary hover:underline mt-1 block">
                            {e.showName}
                          </Link>
                        )}
                        {e.type === "officetask" && (
                          <Link href="/office-tasks" className="text-xs text-purple-500 hover:underline mt-1 block">
                            Office Task
                          </Link>
                        )}
                      </div>
                      {e.type === "officetask" && e.officeTaskId != null && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => handleToggleOfficeTask(e.officeTaskId!, !!e.done)}
                          disabled={updateOfficeTask.isPending}
                        >
                          {e.done
                            ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                            : <Circle className="h-4 w-4 text-muted-foreground" />
                          }
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
