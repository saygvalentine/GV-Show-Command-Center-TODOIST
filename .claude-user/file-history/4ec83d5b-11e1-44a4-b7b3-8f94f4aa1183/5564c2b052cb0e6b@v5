// @refresh reset
import { createContext, useCallback, useContext, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTodoistProjects,
  useGetTodoistSettings,
  useUpdateTodoistSettings,
  getGetTodoistSettingsQueryKey,
  type TodoistSettings,
} from "@workspace/api-client-react";

export interface TodoistProject {
  id: string;
  name: string;
}

interface TodoistContextValue {
  taskProjectId: string;
  eblastProjectId: string;
  projects: TodoistProject[];
  loadingProjects: boolean;
  setTaskProjectId: (id: string) => void;
  setEblastProjectId: (id: string) => void;
}

const TodoistContext = createContext<TodoistContextValue | null>(null);

export function TodoistProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: projectData, isLoading: loadingProjects } = useListTodoistProjects();
  const { data: settings, isLoading: loadingSettings } = useGetTodoistSettings();

  // Monotonic "latest mutation" guard. onMutate allocates a sequence number when a
  // mutation begins; onSuccess/onError only ever act if their own sequence still equals
  // the latest one allocated. Without this, an in-flight request's response arriving
  // *after* a newer request's response would blindly overwrite the newer cached value
  // with its own (now-stale) view — the exact out-of-order-response problem a plain
  // "last response wins" cache write doesn't protect against.
  const latestSequenceRef = useRef(0);

  // PUT is a full-document replacement, not a patch: the server never reads-then-merges
  // (that read-merge is what caused a lost-update race between two near-simultaneous
  // saves). The remaining races this closes are client-side:
  //   1. Without writing the cache until onSuccess, a second setter fired before the
  //      first PUT's response lands would still read the *old* cached document and
  //      resend it, silently reverting the first change — onMutate writes the outgoing
  //      document into the cache immediately, before the request resolves, so a rapid
  //      second change reads the first change's value rather than stale data.
  //   2. Responses can arrive out of send order. onSuccess/onError below only apply
  //      their result when their mutation is still the latest one started; a stale
  //      response is simply ignored rather than clobbering newer state.
  const updateSettings = useUpdateTodoistSettings({
    mutation: {
      onMutate: async (variables) => {
        const sequence = ++latestSequenceRef.current;
        const queryKey = getGetTodoistSettingsQueryKey();
        await queryClient.cancelQueries({ queryKey, exact: true });
        const previous = queryClient.getQueryData<TodoistSettings>(queryKey);
        queryClient.setQueryData<TodoistSettings>(queryKey, variables.data);
        return { previous, sequence };
      },
      onSuccess: (updated, _variables, context) => {
        // A newer mutation has since started — its optimistic (or by-now-authoritative)
        // state is more current than this response, so leave the cache alone.
        if (!context || context.sequence !== latestSequenceRef.current) return;
        queryClient.setQueryData(getGetTodoistSettingsQueryKey(), updated);
      },
      onError: (_err, _variables, context) => {
        // Same staleness guard: an older mutation failing must never roll back a newer
        // optimistic change that's already in the cache.
        if (!context || context.sequence !== latestSequenceRef.current) return;
        const queryKey = getGetTodoistSettingsQueryKey();
        if (context.previous !== undefined) {
          queryClient.setQueryData(queryKey, context.previous);
        } else {
          // No known prior state to restore safely — refetch rather than guess or
          // clear the cache out from under a value we can't verify is stale.
          void queryClient.invalidateQueries({ queryKey, exact: true });
        }
      },
    },
  });

  const projects = projectData?.projects ?? [];

  // Project preferences live in the database rather than this browser's localStorage, so
  // the server can read them without a browser session — a prerequisite for automatic sync.
  // The unchanged field is read straight from the React Query cache at call time — not
  // from a closure over `settings` — so back-to-back picker changes each see the other's
  // just-written (now optimistically-cached) value rather than a value captured before
  // the component re-rendered.
  const saveSettings = useCallback(
    (overrides: Partial<TodoistSettings>) => {
      const queryKey = getGetTodoistSettingsQueryKey();
      const current = queryClient.getQueryData<TodoistSettings>(queryKey) ?? {
        taskProjectId: null,
        eblastProjectId: null,
      };
      const next: TodoistSettings = { ...current, ...overrides };
      updateSettings.mutate({ data: next });
    },
    [updateSettings, queryClient],
  );

  const setTaskProjectId = useCallback(
    (taskProjectId: string) => saveSettings({ taskProjectId }),
    [saveSettings],
  );

  const setEblastProjectId = useCallback(
    (eblastProjectId: string) => saveSettings({ eblastProjectId }),
    [saveSettings],
  );

  return (
    <TodoistContext.Provider
      value={{
        taskProjectId: settings?.taskProjectId ?? "",
        eblastProjectId: settings?.eblastProjectId ?? "",
        projects,
        loadingProjects: loadingProjects || loadingSettings,
        setTaskProjectId,
        setEblastProjectId,
      }}
    >
      {children}
    </TodoistContext.Provider>
  );
}

export function useTodoist(): TodoistContextValue {
  const ctx = useContext(TodoistContext);
  if (!ctx) throw new Error("useTodoist must be used inside TodoistProvider");
  return ctx;
}
