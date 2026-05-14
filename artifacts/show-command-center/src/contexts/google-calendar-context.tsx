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
  calendarId: string;
}

export interface GcalCalendar {
  id: string;
  summary: string;
  primary?: boolean;
}

interface GcalContextValue {
  isConnected: boolean;
  token: string | null;
  calendarId: string;
  calendars: GcalCalendar[];
  loadingCalendars: boolean;
  connect: () => void;
  disconnect: () => void;
  setCalendarId: (id: string) => void;
}

const GcalContext = createContext<GcalContextValue | null>(null);

function loadStored(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
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
      const res = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const data = await res.json() as { items?: GcalCalendar[] };
      setCalendars(data.items ?? []);
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
        const calendarId = loadStored()?.calendarId ?? "primary";
        const newAuth: StoredAuth = { token: resp.access_token, expiresAt, calendarId };
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

  const setCalendarId = useCallback(
    (calendarId: string) => {
      setAuth((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, calendarId };
        saveStored(updated);
        return updated;
      });
    },
    [],
  );

  const isConnected = !!auth && Date.now() < auth.expiresAt;

  return (
    <GcalContext.Provider
      value={{
        isConnected,
        token: isConnected ? auth.token : null,
        calendarId: auth?.calendarId ?? "primary",
        calendars,
        loadingCalendars,
        connect,
        disconnect,
        setCalendarId,
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
