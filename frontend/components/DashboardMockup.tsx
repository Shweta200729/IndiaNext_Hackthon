export default function DashboardMockup() {
    return (
        <section className="container mx-auto px-4 pb-24 relative z-10 w-full max-w-6xl">
            {/* Outer macOS-style window frame with floating animation and soft glow */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-blue-900/5 ring-4 ring-blue-50/50 overflow-hidden animate-float">

                {/* Window Header */}
                <div className="flex items-center px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <div className="w-3 h-3 rounded-full bg-green-400"></div>
                    </div>
                </div>

                {/* Dashboard Content Area */}
                <div className="p-6 md:p-8 flex flex-col gap-6 bg-slate-50/50">

                    {/* Top metric boxes mockups */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-20 md:h-24 rounded-xl bg-white border border-slate-200 shadow-sm"></div>
                        ))}
                    </div>

                    {/* Main Chart mockup area - features a dynamic SVG line chart to closely mimic the reference image */}
                    <div className="relative h-64 md:h-80 w-full rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden flex items-end">
                        {/* Simple SVG Chart Line to represent data */}
                        <svg
                            className="absolute bottom-0 w-full h-full drop-shadow-[0_0_15px_rgba(37,99,235,0.15)]"
                            viewBox="0 0 1000 300"
                            preserveAspectRatio="none"
                        >
                            <path
                                d="M 0 200 C 150 150 250 250 350 250 C 500 250 550 100 650 100 C 750 100 800 280 850 280 C 900 280 950 50 1000 150 L 1000 300 L 0 300 Z"
                                fill="none"
                                stroke="#2563EB"
                                strokeWidth="4"
                                vectorEffect="non-scaling-stroke"
                                className="opacity-90"
                            />
                            {/* Subtle fill gradient under the line */}
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                            </linearGradient>
                            <path
                                d="M 0 200 C 150 150 250 250 350 250 C 500 250 550 100 650 100 C 750 100 800 280 850 280 C 900 280 950 50 1000 150 L 1000 300 L 0 300 Z"
                                fill="url(#chartGradient)"
                            />
                        </svg>
                    </div>

                    {/* Bottom smaller metric boxes mockups */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                        {[...Array(4)].map((_, i) => (
                            <div key={`bottom-${i}`} className="h-16 md:h-20 rounded-xl bg-white border border-slate-200 shadow-sm"></div>
                        ))}
                    </div>

                </div>
            </div>
        </section>
    );
}
