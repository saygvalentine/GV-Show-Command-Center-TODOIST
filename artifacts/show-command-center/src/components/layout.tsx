import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Moon, Sun, LayoutDashboard, Search, CheckSquare, Settings, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const searchStr = useSearch();
  const { theme, setTheme } = useTheme();

  const qFromUrl = location === "/" ? (new URLSearchParams(searchStr).get("q") ?? "") : "";
  const [query, setQuery] = useState(qFromUrl);

  useEffect(() => { setQuery(qFromUrl); }, [qFromUrl]);

  const handleChange = (val: string) => {
    setQuery(val);
    if (location === "/") {
      navigate(val.trim() ? `/?q=${encodeURIComponent(val.trim())}` : "/", { replace: true });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      query.trim() ? navigate(`/?q=${encodeURIComponent(query.trim())}`) : navigate("/");
    }
    if (e.key === "Escape") {
      setQuery("");
      navigate("/");
    }
  };

  const clearSearch = () => {
    setQuery("");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background">
        <div className="container flex h-14 items-center gap-4 mx-auto px-4 md:px-6">
          <div className="flex items-center gap-2 font-bold font-mono tracking-tight text-primary">
            <LayoutDashboard className="h-5 w-5" />
            <span>CMD CENTER</span>
          </div>
          
          <nav className="flex items-center gap-6 ml-6 text-sm font-medium">
            <Link href="/" className={`transition-colors hover:text-foreground/80 ${location === "/" ? "text-foreground" : "text-foreground/60"}`}>
              Dashboard
            </Link>
            <Link href="/calendar" className={`transition-colors hover:text-foreground/80 ${location === "/calendar" ? "text-foreground" : "text-foreground/60"}`}>
              Calendar
            </Link>
            <Link href="/office-tasks" className={`flex items-center gap-1.5 transition-colors hover:text-foreground/80 ${location === "/office-tasks" ? "text-foreground" : "text-foreground/60"}`}>
              <CheckSquare className="h-3.5 w-3.5" />
              Office Tasks
            </Link>
            <Link href="/settings" className={`flex items-center gap-1.5 transition-colors hover:text-foreground/80 ${location === "/settings" ? "text-foreground" : "text-foreground/60"}`}>
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <div className="relative hidden md:flex items-center">
              <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search shows..."
                className="w-64 pl-8 pr-8 h-9 bg-muted/50 border-none focus-visible:ring-1"
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {query && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>
        </div>
      </header>
      
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
