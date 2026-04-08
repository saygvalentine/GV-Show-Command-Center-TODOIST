import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Loader2 } from "lucide-react";
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
import { useCreateShow, getListShowsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { VenueSelect } from "@/components/venue-select";

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

export function AddShowDialog() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const createShow = useCreateShow();
  
  const form = useForm<ShowFormValues>({
    resolver: zodResolver(showSchema),
    defaultValues: {
      name: "",
      moveInDate: "",
      venue: "",
      advanceWarehouseDate: "",
      discountDeadline: "",
      onlineOrderDeadline: "",
      showStart: "",
      dismantleDate: "",
    },
  });

  const onSubmit = (data: ShowFormValues) => {
    createShow.mutate({ data }, {
      onSuccess: (newShow) => {
        toast({ title: "Show created successfully" });
        setOpen(false);
        form.reset();
        
        queryClient.invalidateQueries({ queryKey: getListShowsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        
        setLocation(`/shows/${newShow.id}`);
      },
      onError: (error) => {
        toast({
          title: "Error creating show",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Show
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add New Show</DialogTitle>
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
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="showStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Show Start</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dismantleDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dismantle</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="pt-4 flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createShow.isPending}>
                {createShow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Show
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
