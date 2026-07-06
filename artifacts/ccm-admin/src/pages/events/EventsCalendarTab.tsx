import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { formatDate } from "@/lib/locale";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

async function apiFetch<T>(url: string): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error ?? "Request failed"); }
  return res.json();
}

interface EventRow {
  id: string; title: string; eventType: string;
  startDate: string; startTime: string | null;
  endDate: string | null; venue: string | null; status: string;
}

const TYPE_COLOR: Record<string, string> = {
  academic: "bg-indigo-100 text-indigo-800 border-indigo-200",
  cultural: "bg-pink-100 text-pink-800 border-pink-200",
  sports:   "bg-amber-100 text-amber-800 border-amber-200",
  ceremony: "bg-violet-100 text-violet-800 border-violet-200",
  meeting:  "bg-slate-100 text-slate-700 border-slate-200",
  holiday:  "bg-green-100 text-green-800 border-green-200",
  other:    "bg-gray-100 text-gray-700 border-gray-200",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function EventsCalendarTab() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: events = [], isLoading } = useQuery<EventRow[]>({
    queryKey: ["events-list"],
    queryFn: () => apiFetch("/api/admin/events"),
  });

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  const eventsByDate = events.reduce<Record<string, EventRow[]>>((acc, ev) => {
    const d = ev.startDate;
    if (d.startsWith(monthStr)) {
      (acc[d] ??= []).push(ev);
    }
    return acc;
  }, {});

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-white px-5 py-3">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
        <h3 className="font-semibold text-foreground">{MONTHS[month]} {year}</h3>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar grid */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-white overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase text-muted-foreground">{d}</div>
            ))}
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <div className="grid grid-cols-7">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-border bg-muted/20" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayEvents = eventsByDate[dateStr] ?? [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;

                return (
                  <div
                    key={day}
                    className={cn(
                      "min-h-[80px] border-b border-r border-border p-1.5 cursor-pointer transition-colors",
                      isSelected ? "bg-indigo-50" : "hover:bg-muted/30",
                    )}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  >
                    <div className={cn(
                      "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1",
                      isToday ? "bg-indigo-600 text-white" : "text-foreground",
                    )}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 2).map(ev => (
                        <div
                          key={ev.id}
                          className={cn("text-[10px] font-medium rounded px-1 py-0.5 truncate border", TYPE_COLOR[ev.eventType] ?? TYPE_COLOR.other)}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 2} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side panel — selected day events */}
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm">
              {selectedDate
                ? formatDate(selectedDate + "T00:00:00")
                : "Select a date"}
            </h3>
          </div>
          {!selectedDate ? (
            <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
              <CalendarRange className="h-7 w-7 opacity-30" />
              <p className="text-xs">Click a day to see events</p>
            </div>
          ) : !selectedEvents.length ? (
            <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
              <CalendarRange className="h-7 w-7 opacity-30" />
              <p className="text-xs">No events on this day</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {selectedEvents.map(ev => {
                const typeClass = TYPE_COLOR[ev.eventType] ?? TYPE_COLOR.other;
                return (
                  <li key={ev.id} className="px-4 py-3">
                    <div className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold mb-1.5 border", typeClass)}>
                      {ev.eventType.charAt(0).toUpperCase() + ev.eventType.slice(1)}
                    </div>
                    <p className="text-sm font-semibold text-foreground">{ev.title}</p>
                    {ev.startTime && <p className="text-xs text-muted-foreground mt-0.5">{ev.startTime}{ev.venue ? ` · ${ev.venue}` : ""}</p>}
                    {!ev.startTime && ev.venue && <p className="text-xs text-muted-foreground mt-0.5">{ev.venue}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
