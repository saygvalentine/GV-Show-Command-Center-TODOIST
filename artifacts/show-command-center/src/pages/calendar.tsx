import { useState, useMemo } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useGetCalendarEvents, useListShows } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(startOfDay(new Date()));
  const [selectedShowId, setSelectedShowId] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<Date | null>(startOfDay(new Date()));

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  const { data: shows } = useListShows();
  const { data: events, isLoading } = useGetCalendarEvents(
    { month, year, showId: selectedShowId !== "all" ? Number(selectedShowId) : undefined },
    { query: { queryKey: ["calendar-events", month, year, selectedShowId] } }
  );

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate)
  });

  // Calculate padding days for the first week
  const firstDayOfMonth = startOfMonth(currentDate).getDay();
  const paddingDays = Array.from({ length: firstDayOfMonth }).map((_, i) => i);

  const eventsByDay = useMemo(() => {
    if (!events) return {};
    const map: Record<string, typeof events> = {};
    events.forEach(e => {
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
      case "movein": return "bg-primary/20 text-primary border-primary/30";
      case "eblast": return "bg-pink-500/20 text-pink-500 border-pink-500/30";
      case "task": return "bg-blue-500/20 text-blue-500 border-blue-500/30";
      default: return "bg-gray-500/20 text-gray-500 border-gray-500/30";
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

          <Select value={selectedShowId} onValueChange={setSelectedShowId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Filter by Show" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shows</SelectItem>
              {shows?.map(s => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                            <div key={e.id} className={`text-xs px-1.5 py-0.5 rounded truncate border ${getEventColor(e.type, e.done)}`} title={e.name}>
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
                  <div key={e.id} className="p-3 rounded-lg border bg-card text-card-foreground shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={`uppercase text-[10px] px-1.5 py-0 ${getEventColor(e.type, e.done)}`}>
                            {e.type}
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
                        <Link href={`/shows/${e.showId}`} className="text-xs text-primary hover:underline mt-1 block">
                          {e.showName}
                        </Link>
                      </div>
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
