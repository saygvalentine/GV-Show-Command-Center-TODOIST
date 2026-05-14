import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
import { differenceInDays, startOfDay } from "date-fns";
import {
  useListShows,
  useGetDashboardSummary
} from "@workspace/api-client-react";
import { ShowCard } from "@/components/show-card";
import { Layout } from "@/components/layout";
import { AddShowDialog } from "@/components/add-show-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { parseDateStr } from "@/lib/date-utils";
import { DashboardWeeklyCalendar } from "@/components/dashboard-weekly-calendar";
import { OverduePanel } from "@/components/overdue-panel";
import { DashboardTaskSlider } from "@/components/dashboard-task-slider";

type SortOption = "date-asc" | "date-desc" | "name" | "overdue";

export default function Dashboard() {
  const { data: shows, isLoading: showsLoading } = useListShows();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const [sortBy, setSortBy] = useState<SortOption>("date-asc");
  const [archivedOpen, setArchivedOpen] = useState(false);

  const searchQuery = new URLSearchParams(useSearch()).get("q")?.trim() ?? "";

  const today = startOfDay(new Date());

  const matchesSearch = (s: { name: string; venue?: string | null }, q: string) => {
    const lower = q.toLowerCase();
    return s.name.toLowerCase().includes(lower) || (s.venue ?? "").toLowerCase().includes(lower);
  };

  const activeShows = useMemo(() => {
    if (!shows) return [];
    return shows.filter(s => {
      const cutoff = startOfDay(parseDateStr(s.dismantleDate ?? s.moveInDate));
      return differenceInDays(cutoff, today) >= 0;
    }).filter(s => !searchQuery || matchesSearch(s, searchQuery))
      .sort((a, b) => {
        if (sortBy === "date-asc") {
          return parseDateStr(a.moveInDate).getTime() - parseDateStr(b.moveInDate).getTime();
        }
        if (sortBy === "date-desc") {
          return parseDateStr(b.moveInDate).getTime() - parseDateStr(a.moveInDate).getTime();
        }
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === "overdue") {
          return (b.overdueCount || 0) - (a.overdueCount || 0);
        }
        return 0;
      });
  }, [shows, sortBy, today, searchQuery]);

  const archivedShows = useMemo(() => {
    if (!shows) return [];
    return shows.filter(s => {
      const cutoff = startOfDay(parseDateStr(s.dismantleDate ?? s.moveInDate));
      return differenceInDays(cutoff, today) < 0;
    }).filter(s => !searchQuery || matchesSearch(s, searchQuery))
      .sort((a, b) => parseDateStr(b.moveInDate).getTime() - parseDateStr(a.moveInDate).getTime());
  }, [shows, today, searchQuery]);

  useEffect(() => {
    if (searchQuery && archivedShows.length > 0) setArchivedOpen(true);
  }, [searchQuery, archivedShows.length]);

  return (
    <Layout>
      <div className="container mx-auto p-4 md:p-6 space-y-8">
        
        {/* Due Today / Overdue Slider */}
        <DashboardTaskSlider />

        {/* Weekly Calendar */}
        <DashboardWeeklyCalendar />

        {/* Overdue Panel */}
        <OverduePanel />

        {/* Dashboard Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Active Shows</h1>
            <span className="text-muted-foreground mt-1 block">
              {summaryLoading ? <Skeleton className="w-32 h-5 inline-block" /> : `${summary?.activeShows || 0} active, ${summary?.totalOverdue || 0} items overdue`}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-asc">Date (Earliest First)</SelectItem>
                <SelectItem value="date-desc">Date (Latest First)</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
                <SelectItem value="overdue">Most Overdue</SelectItem>
              </SelectContent>
            </Select>
            
            <AddShowDialog />
          </div>
        </div>

        {/* Active Shows Grid */}
        {showsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-[250px] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeShows.map(show => (
              <ShowCard key={show.id} show={show} />
            ))}
            {activeShows.length === 0 && (
              <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                {searchQuery ? `No shows match "${searchQuery}".` : "No active shows found. Add one to get started."}
              </div>
            )}
          </div>
        )}

        {/* Archived Shows */}
        {archivedShows.length > 0 && (
          <Collapsible
            open={archivedOpen}
            onOpenChange={setArchivedOpen}
            className="mt-12 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight text-muted-foreground">Archived Shows</h2>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {archivedOpen ? "Hide" : "Show"} ({archivedShows.length})
                  {archivedOpen ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
            
            <CollapsibleContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-75 hover:opacity-100 transition-opacity">
                {archivedShows.map(show => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        
      </div>
    </Layout>
  );
}
