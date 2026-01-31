import { MoreHorizontal, ExternalLink, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
  domain: string;
  status: "live" | "building" | "error";
  lastDeployed: string;
  branch: string;
}

interface ProjectsTableProps {
  projects: Project[];
  className?: string;
}

const statusStyles = {
  live: "bg-success/10 text-success",
  building: "bg-warning/10 text-warning",
  error: "bg-destructive/10 text-destructive",
};

const statusLabels = {
  live: "Ready",
  building: "Building",
  error: "Error",
};

export function ProjectsTable({ projects, className }: ProjectsTableProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">Projects</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Name
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                Status
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                Branch
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                Deployed
              </th>
              <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {projects.map((project, index) => (
              <tr
                key={project.id}
                className="transition-colors hover:bg-muted/50 animate-slide-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.domain}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 hidden sm:table-cell">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      statusStyles[project.status]
                    )}
                  >
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                    {statusLabels[project.status]}
                  </span>
                </td>
                <td className="px-5 py-4 hidden md:table-cell">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    {project.branch}
                  </div>
                </td>
                <td className="px-5 py-4 hidden lg:table-cell">
                  <span className="text-xs text-muted-foreground">{project.lastDeployed}</span>
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem>Settings</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
