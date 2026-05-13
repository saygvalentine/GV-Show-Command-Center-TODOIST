import { Link } from "wouter";
import { format, differenceInDays, startOfDay } from "date-fns";
import { Calendar, MapPin, Clock, Truck, Flame, Signpost, Briefcase } from "lucide-react";
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
              <div className="mt-2 flex flex-nowrap items-center gap-x-2 text-xs overflow-hidden">
                <Clock className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                {show.advanceWarehouseDate && (
                  <span className="whitespace-nowrap text-muted-foreground">Adv. WH: <span className="text-foreground font-medium">{format(parseDateStr(show.advanceWarehouseDate), "M/d")}</span></span>
                )}
                {show.onlineOrderDeadline && (
                  <span className="whitespace-nowrap text-muted-foreground">Online: <span className="text-foreground font-medium">{format(parseDateStr(show.onlineOrderDeadline), "M/d")}</span></span>
                )}
                {show.discountDeadline && (
                  <span className="whitespace-nowrap text-muted-foreground">Disc: <span className="text-foreground font-medium">{format(parseDateStr(show.discountDeadline), "M/d")}</span></span>
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

      <CardContent className="pb-4 flex-1 border-t">
        <div className="space-y-4 pt-4">
          {/* Task key dates */}
          <div className="flex flex-nowrap items-center gap-x-3 text-xs overflow-hidden">
            <span className="whitespace-nowrap text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3 shrink-0" />FM: <span className="text-foreground font-medium">{show.fmDeadlineDate ? format(parseDateStr(show.fmDeadlineDate), "M/d") : "N/A"}</span></span>
            <span className="whitespace-nowrap text-muted-foreground flex items-center gap-1"><Signpost className="h-3 w-3 shrink-0" />ID Signs: <span className="text-foreground font-medium">{show.idSignDeadlineDate ? format(parseDateStr(show.idSignDeadlineDate), "M/d") : "N/A"}</span></span>
            <span className="whitespace-nowrap text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3 shrink-0" />Bucket: <span className="text-foreground font-medium">{show.bucketDueDate ? format(parseDateStr(show.bucketDueDate), "M/d") : "N/A"}</span></span>
          </div>
          {/* Status Chips */}
          <div className="grid grid-cols-2 gap-2">
            {/* FM */}
            {show.fireMarshalStatus === "Submitted" ? (
              <Badge variant="outline" className="w-full justify-start bg-green-500/10 text-green-500 border-green-500/20">
                FM: Submitted {show.fireMarshalDate ? format(new Date(show.fireMarshalDate), "M/d") : ""}
              </Badge>
            ) : show.fireMarshalStatus === "In Progress" ? (
              <Badge variant="outline" className="w-full justify-start bg-blue-500/10 text-blue-500 border-blue-500/20 flex items-center gap-1.5">
                <div className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </div>
                FM: In Progress
              </Badge>
            ) : (
              <Badge variant="outline" className="w-full justify-start text-muted-foreground border-muted-foreground/30">
                FM: N/A
              </Badge>
            )}

            {/* ID Signs */}
            {show.idSignStatus === "Ordered" ? (
              <Badge variant="outline" className="w-full justify-start bg-green-500/10 text-green-500 border-green-500/20">
                ID Signs: Ordered {show.idSignDate ? format(new Date(show.idSignDate), "M/d") : ""}
              </Badge>
            ) : show.idSignStatus === "In Progress" ? (
              <Badge variant="outline" className="w-full justify-start bg-purple-500/10 text-purple-500 border-purple-500/20 flex items-center gap-1.5">
                <div className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                </div>
                ID Signs: In Progress
              </Badge>
            ) : (
              <Badge variant="outline" className="w-full justify-start text-muted-foreground border-muted-foreground/30">
                ID Signs: N/A
              </Badge>
            )}

            {/* Kit Sent */}
            {show.exhibitorKitSent && show.exhibitorKitDate ? (
              <Badge variant="outline" className="w-full justify-start bg-pink-500/10 text-pink-500 border-pink-500/20">
                Kit Sent: {format(new Date(show.exhibitorKitDate), "M/d")}
              </Badge>
            ) : (
              <Badge variant="outline" className="w-full justify-start text-muted-foreground border-muted-foreground/30">
                Kit Sent: N/A
              </Badge>
            )}

            {/* Last eBlast */}
            {show.lastEblastDate ? (
              <Badge variant="outline" className="w-full justify-start bg-pink-500/10 text-pink-500 border-pink-500/20">
                Last eBlast: Sent {format(new Date(show.lastEblastDate), "M/d")}
              </Badge>
            ) : (
              <Badge variant="outline" className="w-full justify-start text-muted-foreground border-muted-foreground/30">
                Last eBlast: N/A
              </Badge>
            )}
          </div>

          {/* Overdue Warning */}
          {(show.overdueCount || 0) > 0 && (
            <div className="flex items-center gap-2 text-red-500 bg-red-500/10 px-3 py-2 rounded-md">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </div>
              <span className="text-sm font-medium">
                {show.overdueCount} Overdue Item{show.overdueCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-0 pb-4 border-t flex-none mt-auto">
        <div className="w-full space-y-2 pt-4">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground pt-1">
            <span>{completedItems}/{totalItems} Completed</span>
          </div>
        </div>
      </CardFooter>

      <Link href={`/shows/${show.id}`} className="absolute inset-0 z-10">
        <span className="sr-only">View Show Details</span>
      </Link>
    </Card>
  );
}
