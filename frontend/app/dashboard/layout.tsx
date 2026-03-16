import { Sidebar } from "@/components/Sidebar";
import { TopNav } from "@/components/TopNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <ProtectedRoute>
            <div className="flex min-h-screen bg-slate-50 overflow-hidden font-sans">
                <Sidebar />
                <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
                    {/* Main Background gradient system */}
                    <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 via-slate-50 to-slate-50 pointer-events-none -z-10" />
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-100/30 rounded-full blur-[120px] pointer-events-none -z-10 translate-x-1/3 -translate-y-1/3" />

                    <TopNav />
                    <main className="flex-1 overflow-y-auto p-8 relative z-0">
                        <div className="max-w-7xl mx-auto w-full">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </ProtectedRoute>
    );
}
