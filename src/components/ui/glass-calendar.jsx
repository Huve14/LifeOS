import * as React from "react";
import { Settings, Plus, Edit2, ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths, isSameDay, isToday, getDate, getDaysInMonth, startOfMonth } from "date-fns";
import { cn } from "../../lib/utils";

function GlassCalendar({ selectedDate: propSelectedDate, onDateSelect, tasks = [], className }) {
  const [currentMonth, setCurrentMonth] = React.useState(propSelectedDate || new Date());
  const [selectedDate, setSelectedDate] = React.useState(propSelectedDate || new Date());

  const monthDays = React.useMemo(() => {
    const start = startOfMonth(currentMonth);
    const totalDays = getDaysInMonth(currentMonth);
    const days = [];
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(start.getFullYear(), start.getMonth(), i + 1);
      const dayTasks = tasks.filter(t => t.date && isSameDay(t.date, date));
      days.push({
        date,
        isToday: isToday(date),
        isSelected: isSameDay(date, selectedDate),
        tasks: dayTasks,
      });
    }
    return days;
  }, [currentMonth, selectedDate, tasks]);

  function handleDateClick(date) {
    setSelectedDate(date);
    onDateSelect?.(date);
  }

  const selectedTasks = tasks.filter(t => t.date && isSameDay(t.date, selectedDate));

  return (
    <div className={cn(
      "w-full rounded-3xl p-5 shadow-2xl overflow-hidden",
      "bg-[var(--white)] border border-[var(--line)]",
      "font-sans",
      className
    )}>
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex items-center justify-end">
        <button className="p-2 text-[var(--muted)] hover:bg-[var(--sand)] rounded-full transition-colors">
          <Settings className="h-5 w-5" />
        </button>
      </div>

      <div className="my-6 flex items-center justify-between">
        <p className="text-4xl font-bold tracking-tight text-[var(--dark)]">
          {format(currentMonth, "MMMM")}
        </p>
        <div className="flex items-center space-x-2">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 rounded-full text-[var(--muted)] hover:bg-[var(--sand)] transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 rounded-full text-[var(--muted)] hover:bg-[var(--sand)] transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-hide -mx-5 px-5">
        <div className="flex space-x-4">
          {monthDays.map((day) => (
            <div key={format(day.date, "yyyy-MM-dd")} className="flex flex-col items-center space-y-2 flex-shrink-0">
              <span className="text-xs font-bold text-[var(--muted)]">
                {format(day.date, "E").charAt(0)}
              </span>
              <button
                onClick={() => handleDateClick(day.date)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200 relative",
                  day.isSelected
                    ? "bg-gradient-to-br from-[var(--terracotta)] to-[var(--gold)] text-white shadow-lg"
                    : "hover:bg-[var(--sand)] text-[var(--dark)]"
                )}
              >
                {day.isToday && !day.isSelected && (
                  <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-[var(--terracotta)]"></span>
                )}
                {getDate(day.date)}
              </button>
              {day.tasks.length > 0 && (
                <span className="absolute -top-0.5 right-0 h-2 w-2 rounded-full bg-[var(--teal)]" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 h-px bg-[var(--line)]" />

      <div className="mt-4 space-y-2">
        {selectedTasks.length > 0 ? (
          selectedTasks.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={cn(
                "h-2 w-2 rounded-full flex-shrink-0",
                t.status === 'done' ? 'bg-[var(--teal)]' : 'bg-[var(--gold)]'
              )} />
              <span className={cn(
                "flex-1 text-[var(--dark)]",
                t.status === 'done' && "line-through text-[var(--muted)]"
              )}>{t.text}</span>
              <span className="text-xs text-[var(--muted)]">{t.when}</span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-between">
            <button className="flex items-center space-x-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--dark)] transition-colors">
              <Edit2 className="h-4 w-4" />
              <span>No events this day</span>
            </button>
            <button className="flex items-center space-x-2 rounded-lg bg-[var(--sand)] px-3 py-2 text-xs font-bold text-[var(--dark)] shadow-sm transition-colors hover:bg-[var(--line)]">
              <Plus className="h-4 w-4" />
              <span>Add task</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

console.log('[GlassCalendar] loaded, assigning to window');
Object.assign(window, { GlassCalendar });
