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
import { ExternalLink, Trash2, Plus, Link as LinkIcon, Loader2, Edit2 } from "lucide-react";
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
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: links, isLoading } = useListLinks(showId);
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();

  const addForm = useForm<z.infer<typeof linkSchema>>({
    resolver: zodResolver(linkSchema),
    defaultValues: { title: "", url: "" }
  });

  const onAdd = (data: z.infer<typeof linkSchema>) => {
    createLink.mutate({ showId, data }, {
      onSuccess: () => {
        toast({ title: "Link added" });
        setAddOpen(false);
        addForm.reset();
        queryClient.invalidateQueries({ queryKey: getListLinksQueryKey(showId) });
      }
    });
  };

  const remove = (linkId: number) => {
    deleteLink.mutate({ showId, linkId }, {
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
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Add Link</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Add Link</DialogTitle>
            </DialogHeader>
            <Form {...addForm}>
              <form onSubmit={addForm.handleSubmit(onAdd)} className="space-y-4">
                <FormField
                  control={addForm.control}
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
                  control={addForm.control}
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
          <LinkRow
            key={link.id}
            link={link}
            showId={showId}
            onDelete={() => remove(link.id)}
          />
        ))}
      </div>
    </div>
  );
}

function LinkRow({ link, showId, onDelete }: { link: any, showId: number, onDelete: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();

  const form = useForm<z.infer<typeof linkSchema>>({
    resolver: zodResolver(linkSchema),
    defaultValues: { title: link.title, url: link.url },
  });

  const openEdit = () => {
    form.reset({ title: link.title, url: link.url });
    setEditOpen(true);
  };

  const onEditSubmit = async (data: z.infer<typeof linkSchema>) => {
    deleteLink.mutate({ showId, linkId: link.id }, {
      onSuccess: () => {
        createLink.mutate({ showId, data }, {
          onSuccess: () => {
            toast({ title: "Link updated" });
            setEditOpen(false);
            queryClient.invalidateQueries({ queryKey: getListLinksQueryKey(showId) });
          },
          onError: () => toast({ title: "Error saving link", variant: "destructive" }),
        });
      },
      onError: () => toast({ title: "Error updating link", variant: "destructive" }),
    });
  };

  const isPending = deleteLink.isPending || createLink.isPending;

  return (
    <div className="group flex items-center justify-between p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 text-sm font-medium flex-1 min-w-0 hover:text-primary transition-colors"
      >
        <div className="bg-primary/10 p-2 rounded-md shrink-0">
          <LinkIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <span className="truncate block">{link.title}</span>
          <span className="text-xs text-muted-foreground truncate block">{link.url}</span>
        </div>
        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-50 group-hover:opacity-100 ml-1" />
      </a>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4 shrink-0">
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit}>
              <Edit2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Link</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
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
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
