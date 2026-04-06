import { addDays, subDays, isWeekend, format, differenceInDays, isBefore, startOfDay } from "date-fns";

export function addBusinessDays(date: Date, amount: number): Date {
  let currentDate = date;
  let addedDays = 0;
  
  const step = amount > 0 ? 1 : -1;
  const targetDays = Math.abs(amount);

  while (addedDays < targetDays) {
    currentDate = addDays(currentDate, step);
    if (!isWeekend(currentDate)) {
      addedDays++;
    }
  }

  return currentDate;
}

export function subBusinessDays(date: Date, amount: number): Date {
  return addBusinessDays(date, -amount);
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return format(new Date(dateStr), "MMM d, yyyy");
}

export function getUrgencyInfo(targetDateStr?: string | null) {
  if (!targetDateStr) return { color: "default", label: "NO DATE", daysRemaining: null };
  
  const target = startOfDay(new Date(targetDateStr));
  const today = startOfDay(new Date());
  
  const diff = differenceInDays(target, today);
  
  if (diff < 0) return { color: "gray", label: "PAST", daysRemaining: diff, bgClass: "bg-gray-500", textClass: "text-gray-500" };
  if (diff <= 3) return { color: "red", label: "DUE SOON", daysRemaining: diff, bgClass: "bg-red-500", textClass: "text-red-500" };
  if (diff <= 7) return { color: "amber", label: "URGENT", daysRemaining: diff, bgClass: "bg-amber-500", textClass: "text-amber-500" };
  if (diff <= 14) return { color: "yellow", label: "SOON", daysRemaining: diff, bgClass: "bg-yellow-500", textClass: "text-yellow-500" };
  if (diff <= 30) return { color: "green", label: "ON TRACK", daysRemaining: diff, bgClass: "bg-green-500", textClass: "text-green-500" };
  
  return { color: "indigo", label: "LATER", daysRemaining: diff, bgClass: "bg-indigo-500", textClass: "text-indigo-500" };
}

export function getCategoryColor(category?: string | null) {
  switch (category) {
    case "Fire Marshal": return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20";
    case "ID Sign": return "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20";
    case "Warehouse Manifest": return "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20";
    case "Show Bucket": return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20";
    case "Vehicle Spotting": return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
    case "Electrical": return "bg-red-500/10 text-red-500 hover:bg-red-500/20";
    default: return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
  }
}
