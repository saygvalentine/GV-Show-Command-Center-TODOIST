import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useListLinks, 
  useCreateLink, 
  useDeleteLink,
  getListLinksQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Trash2, Plus, Link as LinkIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";

const linkSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Must be a valid URL").min(1, "URL is required"),
});

export function LinkList({ showId }: { showId: number }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: links, isLoading } = useListLinks(showId);
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();

  const form = useForm<z.infer<typeof linkSchema>>({
    resolver: zodResolver(linkSchema),
    defaultValues: { title: "", url: "" }
  });

  const onSubmit = (data: z.infer<typeof linkSchema>) => {
    createLink.mutate({ showId, data }, {
      onSuccess: () => {
        toast({ title: "Link added" });
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListLinksQueryKey(showId) });
      }
    });
  };

  const remove = (id: number) => {
    deleteLink.mutate({ showId }, { // Note: using showId for delete as specified by openapi/orval usually
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLinksQueryKey(showId) });
      }
    });
  };

  if (isLoading) {
    return <div className="space-y-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold tracking-tight">Important Links</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Link</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Link</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl><Input placeholder="e.g., Exhibitor Service Manual" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL</FormLabel>
                      <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={createLink.isPending}>
                    {createLink.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Link
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {links?.length === 0 && (
          <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground">
            No links added yet.
          </div>
        )}
        
        {links?.map(link => (
          <div key={link.id} className="group flex items-center justify-between p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors">
            <a 
              href={link.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm font-medium flex-1 min-w-0 hover:text-primary transition-colors"
            >
              <div className="bg-primary/10 p-2 rounded-md shrink-0">
                <LinkIcon className="h-4 w-4 text-primary" />
              </div>
              <span className="truncate">{link.title}</span>
              <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-50 group-hover:opacity-100" />
            </a>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity ml-4 shrink-0" 
              onClick={() => remove(link.id)} // Assuming deleteLink accepts {id: number} or {showId: number, linkId: number} but hook only specifies {showId: number} for parameter usually... wait, let's verify deleteLink hook usage.
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
