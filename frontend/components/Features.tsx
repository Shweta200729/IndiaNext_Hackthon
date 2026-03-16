import { GitMerge, LineChart, ShieldCheck, Zap } from 'lucide-react';

const features = [
    {
        icon: <GitMerge className="w-7 h-7 text-blue-600" />,
        title: "Visual Builder",
        description: "Drag-and-drop workflow editor with real-time validation and testing capabilities.",
    },
    {
        icon: <LineChart className="w-7 h-7 text-blue-600" />,
        title: "Real-time Analytics",
        description: "Deep insights into workflow performance, execution times, and error rates.",
    },
    {
        icon: <ShieldCheck className="w-7 h-7 text-blue-600" />,
        title: "Enterprise Security",
        description: "SOC2 compliant, role-based access control, and comprehensive audit logs.",
    },
    {
        icon: <Zap className="w-7 h-7 text-blue-600" />,
        title: "Instant Scale",
        description: "Serverless execution engine that scales automatically with your workload.",
    }
];

export default function Features() {
    return (
        <section id="features" className="py-24 bg-transparent">
            <div className="container mx-auto px-4 relative z-10">

                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-extrabold mb-4 text-slate-900 tracking-tight">Powerful Features for Modern Teams</h2>
                    <p className="text-slate-600 text-lg max-w-xl mx-auto leading-relaxed">Everything you need to orchestrate complex processes with the reliability of enterprise-grade AI infrastructure.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
                    {features.map((feature, index) => (
                        <div
                            key={index}
                            className="bg-gradient-to-br from-white to-blue-50/30 border border-slate-200 border-t-4 border-t-blue-400 p-8 rounded-2xl shadow-sm hover:-translate-y-2 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 group"
                        >
                            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                {feature.icon}
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-slate-900">{feature.title}</h3>
                            <p className="text-slate-600 leading-relaxed text-sm">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
