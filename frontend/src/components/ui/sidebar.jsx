import * as React from "react";
import { PanelLeft, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SidebarContext = React.createContext(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  children,
  ...props
}) {
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
    },
    [open, setOpenProp]
  );

  const toggleSidebar = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, [setOpen]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggleSidebar }}>
      <div
        className={cn("flex min-h-screen w-full bg-white text-neutral-900", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className, children, ...props }) {
  const { open } = useSidebar();

  return (
    <aside
      data-state={open ? "expanded" : "collapsed"}
      className={cn(
        "sticky top-0 h-screen flex flex-col border-r border-[#262626] bg-[#171717] text-neutral-100 transition-all duration-300 ease-in-out shrink-0 select-none overflow-hidden z-30",
        open ? "w-64" : "w-[68px]",
        className
      )}
      {...props}
    >
      <div className="flex h-full w-full flex-col overflow-x-hidden">
        {children}
      </div>
    </aside>
  );
}

export function SidebarTrigger({ className, children, onClick, ...props }) {
  const { toggleSidebar, open } = useSidebar();

  return (
    <button
      type="button"
      onClick={(e) => {
        onClick?.(e);
        toggleSidebar();
      }}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-[#262626] hover:text-white transition-colors cursor-pointer shrink-0",
        className
      )}
      aria-label={open ? "Свернуть меню" : "Развернуть меню"}
      title={open ? "Свернуть меню" : "Развернуть меню"}
      {...props}
    >
      {children ?? (open ? <ChevronsLeft className="h-5 w-5" /> : <ChevronsRight className="h-5 w-5" />)}
    </button>
  );
}

export function SidebarHeader({ className, ...props }) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "border-b border-[#262626]/60 p-3",
        open ? "flex items-center justify-between" : "flex flex-col items-center justify-center gap-2 px-2",
        className
      )}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }) {
  return (
    <div
      className={cn("mt-auto flex flex-col justify-center shrink-0", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-4",
        !open && "p-2 items-center",
        className
      )}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 flex-col p-2",
        !open && "p-0 items-center",
        className
      )}
      {...props}
    />
  );
}

export function SidebarGroupLabel({ className, ...props }) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-xs font-semibold text-neutral-400 uppercase tracking-wider",
        className
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }) {
  return <div className={cn("w-full text-sm", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }) {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-1 list-none p-0 m-0", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({ className, ...props }) {
  return <li className={cn("relative", className)} {...props} />;
}

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  className,
  children,
  ...props
}) {
  const { open } = useSidebar();
  const baseClasses = cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-[#262626] hover:text-white [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0",
    !open && "justify-center px-0 py-2.5",
    isActive && "bg-[#262626] text-white font-semibold",
    className
  );

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      className: cn(baseClasses, children.props.className),
      ...props,
    });
  }

  return (
    <button type="button" className={baseClasses} {...props}>
      {children}
    </button>
  );
}

export function SidebarSeparator({ className, ...props }) {
  return (
    <div
      role="separator"
      className={cn("mx-2 my-2 h-px bg-[#262626]", className)}
      {...props}
    />
  );
}

