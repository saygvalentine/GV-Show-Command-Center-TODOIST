import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateShow, getGetShowQueryKey, getListShowsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { VenueSelect } from "@/components/venue-select";
import { SHOW_TAGS } from "@/components/add-show-dialog";
import { ShowDateRangePicker } from "@/components/show-date-range-picker";

const showSchema = z.object({
  name: z.string().min(1, "Name is required"),
  moveInDate: z.string().min(1, "Move-in date is required"),
  venue: z.string().optional(),
  advanceWarehouseDate: z.string().optional(),
  discountDeadline: z.string().optional(),
  onlineOrderDeadline: z.string().optional(),
  showStart: z.string().optional(),
  dismantleDate: z.string().optional(),
});

type ShowFormValues = z.infer<typeof showSchema>;

interface Show {
  id: number;
  name: string;
  moveInDate: string | Date;
  venue?: string | null;
  advanceWarehouseDate?: string | Date | null;
  discountDeadline?: string | Date | null;
  onlineOrderDeadline?: string | Date | null;
  showStart?: string | Date | null;
  dismantleDate?: string | Date | null;
  tags?: string[];
}

function toInputDate(val: string | Date | null | undefined): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().split("T")[0];
  return String(val).split("T")[0];
}

interface EditShowDialogProps {
  show: Show;
}

export function EditShowDialog({ show }: EditShowDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>(show.tags ?? []);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateShow = useUpdateShow();

  const form = useForm<ShowFormValues>({
    resolver: zodResolver(showSchema),
    defaultValues: {
      name: show.name,
      moveInDate: toInputDate(show.moveInDate),
      venue: show.venue ?? "",
      advanceWarehouseDate: toInputDate(show.advanceWarehouseDate),
      discountDeadline: toInputDate(show.discountDeadline),
      onlineOrderDeadline: toInputDate(show.onlineOrderDeadline),
      showStart: toInputDate(show.showStart),
      dismantleDate: toInputDate(show.dismantleDate),
    },
  });

  useEffect(() => {
    form.reset({
      name: show.name,
      moveInDate: toInputDate(show.moveInDate),
      venue: show.venue ?? "",
      advanceWarehouseDate: toInputDate(show.advanceWarehouseDate),
      discountDeadline: toInputDate(show.discountDeadline),
      onlineOrderDeadline: toInputDate(show.onlineOrderDeadline),
      showStart: toInputDate(show.showStart),
      dismantleDate: toInputDate(show.dismantleDate),
    });
    setSelectedTags(show.tags ?? []);
  }, [show]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const onSubmit = (data: ShowFormValues) => {
    updateShow.mutate({ showId: show.id, data: { ...data, tags: selectedTags } as any }, {
      onSuccess: () => {
        toast({ title: "Show updated successfully" });
        setOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetShowQueryKey(show.id) });
        queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      },
      onError: (error) => {
        toast({
          title: "Error updating show",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" data-testid="button-edit-show">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Edit Show Details</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Show Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., CES 2025" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="moveInDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Move-in Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">Show Dates (Start → Dismantle)</label>
              <ShowDateRangePicker
                startValue={form.watch("showStart") ?? ""}
                endValue={form.watch("dismantleDate") ?? ""}
                onStartChange={(v) => form.setValue("showStart", v)}
                onEndChange={(v) => form.setValue("dismantleDate", v)}
              />
            </div>

            <FormField
              control={form.control}
              name="venue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Venue</FormLabel>
                  <FormControl>
                    <VenueSelect value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="advanceWarehouseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adv. Warehouse</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discountDeadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Deadline</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="onlineOrderDeadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Online Order Deadline</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <p className="text-sm font-medium mb-2">Tags</p>
              <div className="grid grid-cols-2 gap-2">
                {SHOW_TAGS.map((tag) => (
                  <label key={tag} className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={() => toggleTag(tag)}
                    />
                    <span className="text-sm">{tag}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateShow.isPending}>
                {updateShow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
