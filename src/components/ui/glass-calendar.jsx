import * as React from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import {
  addMonths,
  format,
  getDaysInMonth,
  isSameDay,
  isToday,
  startOfMonth,
  subMonths,
} from "date-fns";
import { cn } from "../../lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function taskDateKey(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? format(date, "yyyy-MM-dd")
    : "";
}

function GlassCalendar({
  selectedDate: propSelectedDate,
  onDateSelect,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  tasks = [],
  className,
}) {
  const initialDate = propSelectedDate || new Date();
  const [currentMonth, setCurrentMonth] = React.useState(initialDate);
  const [selectedDate, setSelectedDate] = React.useState(initialDate);

  React.useEffect(() => {
    if (!propSelectedDate) return;
    setSelectedDate(propSelectedDate);
    setCurrentMonth(propSelectedDate);
  }, [propSelectedDate]);

  const tasksByDate = React.useMemo(() => {
    const grouped = new Map();
    tasks.forEach((task) => {
      const key = taskDateKey(task.date);
      if (!key) return;
      const existing = grouped.get(key);
      if (existing) existing.push(task);
      else grouped.set(key, [task]);
    });
    return grouped;
  }, [tasks]);

  const monthDays = React.useMemo(() => {
    const start = startOfMonth(currentMonth);
    const leadingCells = start.getDay();
    const totalDays = getDaysInMonth(currentMonth);
    return [
      ...Array.from({ length: leadingCells }, (_, index) => ({ empty: true, key: `empty-${index}` })),
      ...Array.from({ length: totalDays }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth(), index + 1);
        return {
          empty: false,
          key: taskDateKey(date),
          date,
          tasks: tasksByDate.get(taskDateKey(date)) || [],
        };
      }),
    ];
  }, [currentMonth, tasksByDate]);

  const selectedKey = taskDateKey(selectedDate);
  const selectedTasks = tasksByDate.get(selectedKey) || [];
  const monthTaskCount = React.useMemo(() => monthDays.reduce(
    (total, day) => total + (day.empty ? 0 : day.tasks.length),
    0,
  ), [monthDays]);

  function handleDateClick(date) {
    setSelectedDate(date);
    onDateSelect?.(date);
  }

  return (
    <section className={cn(
      "w-full overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--white)] p-4 shadow-xl sm:p-6",
      className,
    )} aria-label="Task calendar">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--butter)] text-[var(--dark)]">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--dark)] sm:text-3xl">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">
              {monthTaskCount} {monthTaskCount === 1 ? "task" : "tasks"} this month
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              setCurrentMonth(today);
              handleDateClick(today);
            }}
            className="rounded-full border border-[var(--line)] px-3 py-2 text-xs font-bold text-[var(--dark)] transition-colors hover:bg-[var(--sand)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth((month) => subMonths(month, 1))}
            aria-label="Previous month"
            className="rounded-full border border-[var(--line)] p-2 text-[var(--dark)] transition-colors hover:bg-[var(--sand)]"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth((month) => addMonths(month, 1))}
            aria-label="Next month"
            className="rounded-full border border-[var(--line)] p-2 text-[var(--dark)] transition-colors hover:bg-[var(--sand)]"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 border-b border-[var(--line)] pb-2" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="text-center text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)] sm:text-xs">
            <span className="sm:hidden">{weekday.charAt(0)}</span>
            <span className="hidden sm:inline">{weekday}</span>
          </span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
        {monthDays.map((day) => {
          if (day.empty) return <div key={day.key} aria-hidden="true" />;
          const selected = isSameDay(day.date, selectedDate);
          const visibleTasks = day.tasks.slice(0, 2);
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => handleDateClick(day.date)}
              aria-label={`${format(day.date, "EEEE, MMMM d")}${day.tasks.length ? `, ${day.tasks.length} tasks` : ""}`}
              aria-pressed={selected}
              className={cn(
                "group relative min-h-14 rounded-xl border p-1.5 text-left transition-all sm:min-h-24 sm:rounded-2xl sm:p-2",
                selected
                  ? "border-[var(--blue-ink)] bg-[var(--sky)] shadow-sm"
                  : "border-transparent hover:border-[var(--line)] hover:bg-[var(--sand)]",
              )}
            >
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold sm:h-7 sm:w-7 sm:text-sm",
                isToday(day.date)
                  ? "bg-[var(--honey)] text-[var(--dark)]"
                  : selected ? "bg-[var(--white)] text-[var(--dark)]" : "text-[var(--dark)]",
              )}>
                {format(day.date, "d")}
              </span>

              <span className="mt-1 flex gap-1 sm:hidden" aria-hidden="true">
                {day.tasks.slice(0, 3).map((task) => (
                  <span
                    key={task.id}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      task.status === "done" ? "bg-[var(--teal)]" : task.priority === "high" ? "bg-[var(--terracotta)]" : "bg-[var(--gold)]",
                    )}
                  />
                ))}
              </span>

              <span className="mt-1 hidden space-y-1 sm:block" aria-hidden="true">
                {visibleTasks.map((task) => (
                  <span
                    key={task.id}
                    className={cn(
                      "block truncate rounded-md px-1.5 py-1 text-[10px] font-bold",
                      task.status === "done"
                        ? "bg-[var(--sand)] text-[var(--muted)] line-through"
                        : task.priority === "high"
                          ? "bg-[var(--butter)] text-[var(--dark)]"
                          : "bg-[var(--sky)] text-[var(--dark)]",
                    )}
                  >
                    {task.time ? `${task.time} ` : ""}{task.text}
                  </span>
                ))}
                {day.tasks.length > 2 ? (
                  <span className="block pl-1 text-[9px] font-bold text-[var(--muted)]">+{day.tasks.length - 2} more</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-[var(--dark)]">{format(selectedDate, "EEEE, MMMM d")}</p>
            <p className="text-xs text-[var(--muted)]">
              {selectedTasks.length ? `${selectedTasks.length} scheduled` : "Nothing scheduled yet"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onAddTask?.(selectedDate)}
            className="flex items-center gap-2 rounded-full bg-[var(--honey)] px-4 py-2.5 text-xs font-extrabold text-[var(--dark)] shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add task
          </button>
        </div>

        {selectedTasks.length ? (
          <div className="space-y-2">
            {selectedTasks.map((task) => {
              const done = task.status === "done";
              return (
                <article key={task.id} className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--cream)] p-3">
                  <button
                    type="button"
                    onClick={() => onToggleTask?.(task.id)}
                    aria-label={done ? `Mark ${task.text} incomplete` : `Mark ${task.text} complete`}
                    className={cn(
                      "flex h-8 w-8 flex-none items-center justify-center rounded-full border transition-colors",
                      done ? "border-[var(--teal)] bg-[var(--teal)] text-white" : "border-[var(--line)] bg-[var(--white)] text-transparent hover:border-[var(--teal)]",
                    )}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-bold text-[var(--dark)]", done && "text-[var(--muted)] line-through")}>{task.text}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                      {task.time || "Any time"}{task.priority === "high" ? " · High priority" : task.priority === "low" ? " · Low priority" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteTask?.(task.id)}
                    aria-label={`Delete ${task.text}`}
                    className="rounded-full p-2 text-[var(--muted)] transition-colors hover:bg-[var(--white)] hover:text-[var(--terracotta)]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAddTask?.(selectedDate)}
            className="w-full rounded-2xl border border-dashed border-[var(--line)] px-4 py-5 text-sm font-bold text-[var(--muted)] transition-colors hover:border-[var(--blue)] hover:bg-[var(--sky)] hover:text-[var(--dark)]"
          >
            Choose this day for your next task
          </button>
        )}
      </div>
    </section>
  );
}

Object.assign(window, { GlassCalendar });
