import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  user: string;
  action: string;
  target: string;
  time: string;
  avatar?: string;
}

interface ActivityListProps {
  activities: Activity[];
  className?: string;
}

export function ActivityList({ activities, className }: ActivityListProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
      </div>
      <div className="divide-y divide-border">
        {activities.map((activity, index) => (
          <div
            key={activity.id}
            className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/50 animate-slide-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {activity.user.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-medium">{activity.user}</span>{" "}
                <span className="text-muted-foreground">{activity.action}</span>{" "}
                <span className="font-medium">{activity.target}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
