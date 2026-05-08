import { Link } from "wouter";
import { format, differenceInDays, startOfDay } from "date-fns";
import { Calendar, MapPin, Clock, Truck } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Show } from "@workspace/api-client-react";
import { getUrgencyInfo, formatDate, parseDateStr } from "@/lib/date-utils";
import { UrgencyBadge } from "./urgency-badge";

interface ShowCardProps {
  show: Show;
}

export function ShowCard({ show }: ShowCardProps) {
  const urgency = getUrgencyInfo(show.moveInDate);
  const totalItems = (show.taskCount || 0) + (show.eblastCount || 0);
  const completedItems = (show.completedTaskCount || 0) + (show.sentEblastCount || 0);
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  
  const moveInDate = startOfDay(parseDateStr(show.moveInDate));
  const today = startOfDay(new Date());
  const daysUntil = differenceInDays(moveInDate, today);
  
  return (
    <Card className="relative overflow-hidden flex flex-col h-full hover:border-primary/50 transition-colors group">
      {/* Top Color Bar */}
      <div className={`h-1.5 w-full ${urgency.bgClass}`} />
      
      <CardHeader className="pb-3 flex-none">
        <div className="flex justify-between items-start">
          <div className="space-y-1.5 pr-4 min-w-0">
            <Link href={`/shows/${show.id}`} className="font-semibold text-lg hover:underline underline-offset-4 decoration-primary/50">
              {show.name}
            </Link>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                <span>{formatDate(show.moveInDate)}</span>
              </div>
              {(show.showStart || show.dismantleDate) && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {show.showStart ? formatDate(show.showStart) : ""}
                    {show.showStart && show.dismantleDate ? " – " : ""}
                    {show.dismantleDate ? formatDate(show.dismantleDate) : ""}
                  </span>
                </div>
              )}
              {show.venue && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="truncate">{show.venue}</span>
                </div>
              )}
            </div>

            {(show.advanceWarehouseDate || show.onlineOrderDeadline || show.discountDeadline) && (
              <div className="mt-2 flex items-center gap-x-2 text-xs overflow-hidden whitespace-nowrap pb-2 border-b border-border/60">
                <Clock className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                {show.advanceWarehouseDate && (
                  <span className="text-muted-foreground">WH: <span className="text-foreground font-medium">{format(parseDateStr(show.advanceWarehouseDate), "M/d")}</span></span>
                )}
                {show.onlineOrderDeadline && (
                  <span className="text-muted-foreground">OL: <span className="text-foreground font-medium">{format(parseDateStr(show.onlineOrderDeadline), "M/d")}</span></span>
                )}
                {show.discountDeadline && (
                  <span className="text-muted-foreground">Disc: <span className="text-foreground font-medium">{format(parseDateStr(show.discountDeadline), "M/d")}</span></span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-2 shrink-0">
            <UrgencyBadge dateStr={show.moveInDate} />
            <div className="text-center">
              <span className={`text-4xl font-bold tracking-tighter ${urgency.textClass}`}>
                {Math.abs(daysUntil)}
              </span>
              <span className="text-xs uppercase font-medium tracking-wider text-muted-foreground block -mt-1">
                {daysUntil < 0 ? 'Days Ago' : 'Days'}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pb-4 flex-1">
        <div className="space-y-4">
          {/* Status Chips */}
          <div className="flex flex-wrap gap-2">
            {(show.fireMarshalStatus || show.fireMarshalDate) && (
              show.fireMarshalStatus === "Submitted" ? (
                <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400">FM: Submitted</Badge>
              ) : show.fireMarshalStatus === "In Progress" ? (
                <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400">FM: In Progress</Badge>
              ) : show.fireMarshalDate ? (
                <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">FM: {format(parseDateStr(show.fireMarshalDate), "M/d")}</Badge>
              ) : null
            )}
            {(show.idSignStatus || show.idSignDate) && (
              show.idSignStatus === "Submitted" ? (
                <Badge variant="outline" className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400">ID Sign: Submitted</Badge>
              ) : show.idSignStatus === "In Progress" ? (
                <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400">ID Sign: In Progress</Badge>
              ) : show.idSignDate ? (
                <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">ID Sign: {format(parseDateStr(show.idSignDate), "M/d")}</Badge>
              ) : null
            )}
          </div>

          {/* Overdue Alert */}
          {show.overdueCount && show.overdueCount > 0 && (
            <div className="rounded-md bg-red-500/15 border border-red-500/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              <span className="font-medium">{show.overdueCount} Overdue Items</span>
            </div>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="pt-0 pb-4 flex-none">
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="text-sm text-muted-foreground">
            {completedItems}/{totalItems} Completed
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
