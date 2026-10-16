import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SearchBar } from "@/components/SearchBar";

export default function Layout({ children }) {
  return (
    <SidebarProvider className="bg-[#121212] text-white">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-screen bg-[#121212] text-white">
        {/* Верхняя шапка с полем поиска музыки */}
        <header className="sticky top-0 z-40 w-full px-8 pt-5 pb-3 bg-[#121212]/95 backdrop-blur-sm">
          <SearchBar />
        </header>

        {/* Основное содержимое страницы */}
        <main className="flex-1 w-full px-8 pb-8 min-w-0 transition-all duration-300">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}