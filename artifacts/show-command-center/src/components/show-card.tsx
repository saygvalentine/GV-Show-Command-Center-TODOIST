import { Link } from "wouter";
import { format, differenceInDays, startOfDay } from "date-fns";
import { Calendar, MapPin } from "lucide-react";
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
          <div className="space-y-1.5 pr-4">
            <Link href={`/shows/${show.id}`} className="font-semibold text-lg hover:underline underline-offset-4 decoration-primary/50">
              {show.name}
            </Link>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Move-in: {formatDate(show.moveInDate)}</span>
              </div>
              {(show.showStart || show.dismantleDate) && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 opacity-50" />
                  <span>
                    Show: {show.showStart ? formatDate(show.showStart) : ""}
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
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                  FM: Submitted
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 flex items-center gap-1.5">
                  <div className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </div>
                  FM: {show.fireMarshalStatus || formatDate(show.fireMarshalDate)}
                </Badge>
              )
            )}
            {show.idSignStatus && (
              show.idSignStatus === "Ordered" ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                  ID Sign: Ordered
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20 flex items-center gap-1.5">
                  <div className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                  </div>
                  ID Sign: {show.idSignStatus}
                </Badge>
              )
            )}
            {show.exhibitorKitSent && show.exhibitorKitDate && (
              <Badge variant="outline" className="bg-pink-500/10 text-pink-500 border-pink-500/20">
                XBR Kit Sent: {formatDate(show.exhibitorKitDate)}
              </Badge>
            )}
            {show.lastEblastDate && (
              <Badge variant="outline" className="bg-pink-500/10 text-pink-500 border-pink-500/20">
                Last e-Blast Sent: {formatDate(show.lastEblastDate)}
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
