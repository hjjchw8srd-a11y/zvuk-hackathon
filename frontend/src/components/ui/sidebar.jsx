import * as React from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
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
  const [openMobile, setOpenMobile] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setOpenMobile(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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
    if (isMobile) {
      setOpenMobile((prev) => !prev);
    } else {
      setOpen((prev) => !prev);
    }
  }, [isMobile, setOpen]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggleSidebar, openMobile, setOpenMobile, isMobile }}>
      <div
        className={cn("flex min-h-screen w-full bg-white text-neutral-900", className)}
        {...props}
        style={{ "--sidebar-width": isMobile ? "0px" : open ? "16rem" : "72px", ...(props.style || {}) }}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className, children, ...props }) {
  const { open, isMobile, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    if (!openMobile) return null;
    return (
      <div className="fixed inset-0 z-50 flex md:hidden">
        <button type="button" aria-label="Закрыть меню" className="fixed inset-0 bg-black/80 backdrop-blur-xs" onClick={() => setOpenMobile(false)} />
        <aside className={cn("relative z-10 flex h-[100dvh] w-[290px] max-w-[85vw] flex-col bg-[#171717] border-r border-[#262626] text-neutral-100 shadow-2xl select-none overflow-hidden", className)} {...props}>
          <div className="flex h-full w-full flex-col overflow-hidden">{children}</div>
        </aside>
      </div>
    );
  }

  return (
    <aside
      data-state={open ? "expanded" : "collapsed"}
      className={cn(
        "relative self-stretch min-h-screen hidden md:flex flex-col border-r border-[#262626] bg-[#171717] text-neutral-100 transition-all duration-300 ease-in-out shrink-0 select-none z-30",
        open ? "w-64" : "w-[72px]",
        className
      )}
      {...props}
    >
      <div className="sticky top-0 h-[100dvh] flex flex-col w-full overflow-hidden">
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
        "inline-flex items-center justify-center transition-colors cursor-pointer shrink-0",
        open
          ? "h-8 w-8 rounded-lg text-neutral-400 hover:bg-[#262626] hover:text-white"
          : "w-12 h-12 rounded-2xl bg-[#1b1b1b] text-neutral-400 hover:bg-[#262626] hover:text-white",
        className
      )}
      aria-label={open ? "Свернуть меню" : "Развернуть меню"}
      title={open ? "Свернуть меню" : "Развернуть меню"}
      {...props}
    >
      {children ?? (open ? <ChevronsLeft className="h-5 w-5" /> : <ChevronsRight className="h-6 w-6" />)}
    </button>
  );
}

export function SidebarHeader({ className, ...props }) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "shrink-0 sticky top-0 z-20 bg-[#171717] border-b border-[#262626]/60 p-3",
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
      className={cn("mt-auto shrink-0 sticky bottom-0 z-20 bg-[#171717] border-t border-[#262626]/60 flex flex-col justify-center", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }) {
  const { open } = useSidebar();
  return (
    <div
      className={cn(
        "flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden p-4 scrollbar-none",
        !open && "p-2 items-center gap-3",
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
  const { open } = useSidebar();
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-1 list-none p-0 m-0", !open && "gap-2 items-center", className)}
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
    "flex items-center transition-colors duration-150 cursor-pointer [&>svg]:shrink-0 border-0",
    open
      ? cn("w-full gap-3 rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 hover:bg-[#262626] hover:text-white [&>svg]:h-5 [&>svg]:w-5", isActive && "bg-[#262626] text-white font-semibold")
      : cn("w-12 h-12 justify-center p-0 rounded-2xl mx-auto [&>svg]:h-6 [&>svg]:w-6 shadow-xs", isActive ? "bg-[#262419] text-[#FDE047] font-semibold" : "bg-[#1b1b1b] text-neutral-400 hover:text-white hover:bg-[#262626]"),
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
  const { open } = useSidebar();
  return (
    <div
      role="separator"
      className={cn("bg-[#262626]", open ? "mx-2 my-2 h-px" : "my-3 mx-auto w-8 h-px bg-[#262626]/80", className)}
      {...props}
    />
  );
}

