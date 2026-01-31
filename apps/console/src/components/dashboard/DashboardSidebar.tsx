import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  BarChart3,
  Users,
  Settings,
  Bell,
  FileText,
  CreditCard,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { title: "Console", icon: LayoutDashboard, href: "/" },
  { title: "Projects", icon: FolderKanban, href: "/projects" },
  { title: "Analytics", icon: BarChart3, href: "/analytics" },
  { title: "Team", icon: Users, href: "/team" },
  { title: "Documents", icon: FileText, href: "/documents" },
  { title: "Billing", icon: CreditCard, href: "/billing" },
];

const bottomItems = [
  { title: "Settings", icon: Settings, href: "/settings" },
  { title: "Help", icon: HelpCircle, href: "/help" },
];

interface DashboardSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function DashboardSidebar({
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
}: DashboardSidebarProps) {
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground">
            <span className="text-sm font-bold text-background">D</span>
          </div>
          {!collapsed && (
            <span className="text-base font-semibold text-foreground animate-fade-in">
              Deca
            </span>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={() => onMobileOpenChange(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
              "hover:bg-accent",
              isActive(item.href)
                ? "bg-accent text-foreground"
                : "text-muted-foreground",
              collapsed && "justify-center px-2"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="animate-fade-in">{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        {bottomItems.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={() => onMobileOpenChange(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150",
              "hover:bg-accent",
              isActive(item.href)
                ? "bg-accent text-foreground"
                : "text-muted-foreground",
              collapsed && "justify-center px-2"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="animate-fade-in">{item.title}</span>}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="hidden md:flex mt-2 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden"
          onClick={() => onMobileOpenChange(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onMobileOpenChange(false);
            }
          }}
          role="button"
          tabIndex={0}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-sidebar border-r border-sidebar-border transition-transform duration-200 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent />
      </aside>

      <aside
        className={cn(
          "hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
