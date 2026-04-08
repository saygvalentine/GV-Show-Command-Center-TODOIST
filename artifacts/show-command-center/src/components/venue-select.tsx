import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Venue {
  id: number;
  name: string;
}

async function fetchVenues(): Promise<Venue[]> {
  const res = await fetch("/api/venues");
  if (!res.ok) throw new Error("Failed to fetch venues");
  return res.json();
}

async function createVenue(name: string): Promise<Venue> {
  const res = await fetch("/api/venues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create venue");
  return res.json();
}

interface VenueSelectProps {
  value?: string;
  onChange: (value: string) => void;
}

export function VenueSelect({ value, onChange }: VenueSelectProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: fetchVenues,
  });

  const createMutation = useMutation({
    mutationFn: createVenue,
    onSuccess: (venue) => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      onChange(venue.name);
      setNewVenueName("");
      setAdding(false);
      toast({ title: `Venue "${venue.name}" added` });
    },
    onError: () => {
      toast({ title: "Failed to add venue", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    const name = newVenueName.trim();
    if (!name) return;
    createMutation.mutate(name);
  };

  if (adding) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="Venue name..."
          value={newVenueName}
          onChange={(e) => setNewVenueName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
            if (e.key === "Escape") { setAdding(false); setNewVenueName(""); }
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={createMutation.isPending || !newVenueName.trim()}
        >
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => { setAdding(false); setNewVenueName(""); }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="flex-1">
          {isLoading ? (
            <span className="text-muted-foreground">Loading...</span>
          ) : (
            <SelectValue placeholder="Select a venue...">
              {value ? (
                <span className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {value}
                </span>
              ) : (
                <span className="text-muted-foreground">Select a venue...</span>
              )}
            </SelectValue>
          )}
        </SelectTrigger>
        <SelectContent>
          {venues.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No venues yet — add one below
            </div>
          ) : (
            venues.map((v) => (
              <SelectItem key={v.id} value={v.name}>
                <span className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {v.name}
                </span>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        title="Add new venue"
        onClick={() => setAdding(true)}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
