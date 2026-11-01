import { Check, Clock, X } from "lucide-react";
import type { TimelineEvent } from "@/lib/booking-timeline";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Vertical follow-up of a booking: what happened, what is happening now,
 * what comes next. Every state has an icon AND a screen-reader word, never
 * a colour alone. */
export function BookingTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="flex flex-col">
      {events.map((event, index) => (
        <li key={event.key} className="relative flex gap-3 pb-5 last:pb-0">
          {index < events.length - 1 && (
            <span aria-hidden="true" className="absolute left-3.5 top-7 bottom-0 w-px bg-border" />
          )}
          <span
            aria-hidden="true"
            className={cn(
              "z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs",
              event.state === "done" && "bg-primary text-primary-foreground",
              event.state === "current" && "bg-accent/20 text-foreground ring-2 ring-accent/50",
              event.state === "todo" && "border border-input text-muted-foreground",
              event.state === "problem" && "bg-danger/10 text-danger"
            )}
          >
            {event.state === "done" ? (
              <Check className="size-4" />
            ) : event.state === "problem" ? (
              <X className="size-4" />
            ) : event.state === "current" ? (
              <Clock className="size-4" />
            ) : (
              index + 1
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-medium", event.state === "todo" ? "text-muted-foreground" : "text-foreground")}>
              {event.title}
              <span className="sr-only">
                {event.state === "done"
                  ? " — terminé"
                  : event.state === "current"
                    ? " — en cours"
                    : event.state === "problem"
                      ? " — problème"
                      : " — à venir"}
              </span>
            </p>
            {event.at && <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>}
            {event.detail && <p className="text-sm text-muted-foreground">{event.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
