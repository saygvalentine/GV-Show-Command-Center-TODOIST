import { useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { format, differenceInDays, startOfDay } from "date-fns";
import { useGetShow, useUpdateShow, useDeleteShow, getGetShowQueryKey, getListShowsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useGcal } from "@/contexts/google-calendar-context";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, MapPin, Trash2, CheckCircle2, AlertCircle, Tag, CalendarSync, Loader2 } from "lucide-react";
import { UrgencyBadge } from "@/components/urgency-badge";
import { getUrgencyInfo, formatDate, parseDateStr } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { TaskList } from "@/components/task-list";
import { EblastList } from "@/components/eblast-list";
import { LinkList } from "@/components/link-list";
import { EditShowDialog } from "@/components/edit-show-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

export default function ShowDetail() {
  const { id } = useParams();
  const showId = Number(id);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab") || "tasks";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: show, isLoading } = useGetShow(showId);
  const deleteShow = useDeleteShow();
  const { isConnected, token, calendarId } = useGcal();
  const [syncing, setSyncing] = useState(false);

  const handleGcalSync = async () => {
    if (!isConnected || !token) {
      toast({
        title: "Not connected to Google Calendar",
        description: "Go to Settings to connect your Google account first.",
        variant: "destructive",
      });
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(
        `/api/export/google-calendar/sync?showId=${showId}&calendarId=${encodeURIComponent(calendarId)}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
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

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto p-4 md:p-6 space-y-6">
          <Skeleton className="w-24 h-8" />
          <Skeleton className="w-full h-48 rounded-xl" />
          <Skeleton className="w-full h-[500px] rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!show) {
    return (
      <Layout>
        <div className="container mx-auto p-4 text-center mt-20">
          <h2 className="text-2xl font-bold">Show not found</h2>
          <Button onClick={() => setLocation("/")} className="mt-4">Back to Dashboard</Button>
        </div>
      </Layout>
    );
  }

  const urgency = getUrgencyInfo(show.moveInDate);
  const totalItems = (show.taskCount || 0) + (show.eblastCount || 0);
  const completedItems = (show.completedTaskCount || 0) + (show.sentEblastCount || 0);
  const progress = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  const daysUntil = differenceInDays(startOfDay(parseDateStr(show.moveInDate)), startOfDay(new Date()));

  const handleDelete = () => {
    deleteShow.mutate({ showId }, {
      onSuccess: () => {
        toast({ title: "Show deleted" });
        queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setLocation("/");
      },
      onError: (error) => {
        toast({ title: "Error deleting show", variant: "destructive", description: error.message });
      }
    });
  };

  return (
    <Layout>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Show Details</h1>
          <div className="ml-auto flex gap-2">
            <EditShowDialog show={show} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Show?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{show.name}" and all of its tasks, eBlasts, and links. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete Show
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Card className="relative overflow-hidden border-2">
          <div className={`absolute top-0 left-0 bottom-0 w-2 ${urgency.bgClass}`} />
          <CardContent className="p-6 pl-8">
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-4 flex-1">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-bold">{show.name}</h2>
                    <UrgencyBadge dateStr={show.moveInDate} />
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                    <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                      <Calendar className="h-4 w-4" />
                      <span className="font-medium text-foreground">Move-in:</span> {formatDate(show.moveInDate)}
                    </div>
                    {show.venue && (
                      <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
                        <MapPin className="h-4 w-4" />
                        <span>{show.venue}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Adv Warehouse</div>
                    <div className="font-medium">{formatDate(show.advanceWarehouseDate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Discount Deadline</div>
                    <div className="font-medium">{formatDate(show.discountDeadline)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Online Order</div>
                    <div className="font-medium">{formatDate(show.onlineOrderDeadline)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Show Dates</div>
                    <div className="font-medium">{formatDate(show.showStart)} - {formatDate(show.dismantleDate)}</div>
                  </div>
                </div>

                {show.tags && show.tags.length > 0 && (
                  <div className="pt-4 border-t flex flex-wrap gap-2 items-center">
                    <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                    {show.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs font-semibold">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end justify-between min-w-[200px] border-l pl-6">
                <div className="text-right w-full">
                  <span className={`text-6xl font-black tracking-tighter ${urgency.textClass}`}>
                    {Math.abs(daysUntil)}
                  </span>
                  <span className="text-sm uppercase font-bold tracking-widest text-muted-foreground block -mt-1">
                    {daysUntil < 0 ? 'Days Ago' : 'Days'}
                  </span>
                </div>
                
                <div className="w-full mt-6 space-y-2">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Overall Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-3" />
                  <div className="text-xs text-muted-foreground text-right">
                    {completedItems} of {totalItems} items completed
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue={tabParam} className="w-full">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={handleGcalSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarSync className="h-4 w-4 mr-2" />}
              Sync to Google Calendar
            </Button>
          </div>
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-background mb-6 sticky top-14 z-40">
            <TabsTrigger 
              value="tasks" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background px-6 py-3 font-semibold text-base"
            >
              Tasks
              {show.taskCount ? <span className="ml-2 bg-muted px-2 py-0.5 rounded-full text-xs">{show.taskCount}</span> : null}
            </TabsTrigger>
            <TabsTrigger 
              value="eblasts" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-pink-500 data-[state=active]:bg-background px-6 py-3 font-semibold text-base data-[state=active]:text-pink-500"
            >
              eBlasts
              {show.eblastCount ? <span className="ml-2 bg-muted px-2 py-0.5 rounded-full text-xs">{show.eblastCount}</span> : null}
            </TabsTrigger>
            <TabsTrigger 
              value="links" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-background px-6 py-3 font-semibold text-base"
            >
              Links
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="tasks" className="mt-0 outline-none">
            <TaskList show={show} />
          </TabsContent>
          <TabsContent value="eblasts" className="mt-0 outline-none">
            <EblastList show={show} />
          </TabsContent>
          <TabsContent value="links" className="mt-0 outline-none">
            <LinkList showId={showId} />
          </TabsContent>
        </Tabs>

      </div>
    </Layout>
  );
}
