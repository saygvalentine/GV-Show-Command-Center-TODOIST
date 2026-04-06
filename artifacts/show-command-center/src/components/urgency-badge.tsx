import { Badge } from "@/components/ui/badge";
import { getUrgencyInfo } from "@/lib/date-utils";

export function UrgencyBadge({ dateStr }: { dateStr?: string | null }) {
  const { color, label, bgClass } = getUrgencyInfo(dateStr);
  
  return (
    <Badge className={`${bgClass} text-white hover:${bgClass} border-transparent font-mono font-bold tracking-wider`}>
      {label}
    </Badge>
  );
}
