import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useGetOverdueItems } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

const CATEGORY_COLORS: Record<string, string> = {
  "Show Bucket":        "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Fire Marshal":       "bg-red-500/15 text-red-400 border-red-500/30",
  "ID Sign":            "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Warehouse Manifest": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Vehicle Spotting":   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  eblast:               "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

function chipClass(type: string, category: string | null | undefined) {
  if (type === "eblast") return CATEGORY_COLORS["eblast"];
  const key = category ?? "";
  return CATEGORY_COLORS[key] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
}

function daysLabel(n: number) {
  if (n === 1) return "1 day";
  return `${n} days`;
}

export function OverduePanel() {
  const { data: items, isLoading } = useGetOverdueItems();
  const [open, setOpen] = useState(true);

  const count = items?.length ?? 0;

  if (!isLoading && count === 0) return null;

  // Group by show for display, but keep flat list sorted by daysOverdue desc
  const grouped = items
    ? items.reduce<Record<string, typeof items>>((acc, item) => {
        const key = `${item.showId}::${item.showName}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {})
    : {};

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-red-500/20">
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h2 className="font-semibold text-sm">Overdue</h2>
            {count > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                {count}
              </Badge>
            )}
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="text-xs">{open ? "Hide" : "Show"}</span>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 py-6 text-sm text-muted-foreground text-center">Loading…</div>
            ) : (
              <div className="divide-y">
                {Object.entries(grouped).map(([key, showItems]) => {
                  const showName = key.split("::").slice(1).join("::");
                  const showId = showItems[0].showId;
                  return (
                    <div key={key} className="px-4 py-2">
                      <Link
                        href={`/shows/${showId}?tab=tasks`}
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide mb-1.5 block"
                      >
                        {showName}
                      </Link>
                      <div className="space-y-1">
                        {showItems.map(item => (
                          <Link
                            key={`${item.type}-${item.id}`}
                            href={`/shows/${item.showId}?tab=${item.type === "eblast" ? "eblasts" : "tasks"}`}
                            className="flex items-center justify-between gap-3 group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border ${chipClass(item.type, item.category)}`}
                              >
                                {item.type === "eblast" ? "E-Blast" : (item.category ?? "Task")}
                              </span>
                              <span className="text-sm truncate group-hover:text-primary transition-colors">
                                {item.name}
                              </span>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-red-400 whitespace-nowrap">
                              {daysLabel(item.daysOverdue)} ago
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
