import { createContext, useCallback, useContext, useEffect, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
          }): { requestAccessToken(): void };
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");
const STORAGE_KEY = "gcal_auth";

interface StoredAuth {
  token: string;
  expiresAt: number;
  taskCalendarId: string;
  eblastCalendarId: string;
}

export interface GcalCalendar {
  id: string;
  summary: string;
  primary?: boolean;
}

interface GcalContextValue {
  isConnected: boolean;
  token: string | null;
  taskCalendarId: string;
  eblastCalendarId: string;
  calendars: GcalCalendar[];
  loadingCalendars: boolean;
  connect: () => void;
  disconnect: () => void;
  setTaskCalendarId: (id: string) => void;
  setEblastCalendarId: (id: string) => void;
}

const GcalContext = createContext<GcalContextValue | null>(null);

function loadStored(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuth> & { calendarId?: string };
    return {
      token: parsed.token ?? "",
      expiresAt: parsed.expiresAt ?? 0,
      taskCalendarId: parsed.taskCalendarId ?? parsed.calendarId ?? "primary",
      eblastCalendarId: parsed.eblastCalendarId ?? parsed.calendarId ?? "primary",
    };
  } catch {
    return null;
  }
}

function saveStored(auth: StoredAuth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function GcalProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => {
    const stored = loadStored();
    if (!stored || Date.now() >= stored.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  });

  const [calendars, setCalendars] = useState<GcalCalendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  const fetchCalendars = useCallback(async (token: string) => {
    setLoadingCalendars(true);
    try {
      const res = await fetch("/api/export/google-calendar/calendars", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as { calendars?: GcalCalendar[] };
      setCalendars(data.calendars ?? []);
    } finally {
      setLoadingCalendars(false);
    }
  }, []);

  useEffect(() => {
    if (auth?.token) fetchCalendars(auth.token);
  }, [auth?.token, fetchCalendars]);

  const connect = useCallback(() => {
    if (!window.google?.accounts?.oauth2) {
      console.error("Google Identity Services not loaded yet");
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) return;
        const expiresAt = Date.now() + (Number(resp.expires_in ?? 3600) - 60) * 1000;
        const prev = loadStored();
        const newAuth: StoredAuth = {
          token: resp.access_token,
          expiresAt,
          taskCalendarId: prev?.taskCalendarId ?? "primary",
          eblastCalendarId: prev?.eblastCalendarId ?? "primary",
        };
        saveStored(newAuth);
        setAuth(newAuth);
      },
    });
    client.requestAccessToken();
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
    setCalendars([]);
  }, []);

  const setTaskCalendarId = useCallback((taskCalendarId: string) => {
    setAuth((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, taskCalendarId };
      saveStored(updated);
      return updated;
    });
  }, []);

  const setEblastCalendarId = useCallback((eblastCalendarId: string) => {
    setAuth((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, eblastCalendarId };
      saveStored(updated);
      return updated;
    });
  }, []);

  const isConnected = !!auth && Date.now() < auth.expiresAt;

  return (
    <GcalContext.Provider
      value={{
        isConnected,
        token: isConnected ? auth.token : null,
        taskCalendarId: auth?.taskCalendarId ?? "primary",
        eblastCalendarId: auth?.eblastCalendarId ?? "primary",
        calendars,
        loadingCalendars,
        connect,
        disconnect,
        setTaskCalendarId,
        setEblastCalendarId,
      }}
    >
      {children}
    </GcalContext.Provider>
  );
}

export function useGcal(): GcalContextValue {
  const ctx = useContext(GcalContext);
  if (!ctx) throw new Error("useGcal must be used inside GcalProvider");
  return ctx;
}
