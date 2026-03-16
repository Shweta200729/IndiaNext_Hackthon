import { Check } from 'lucide-react';
import Link from 'next/link';

const plans = [
    {
        name: "Starter",
        price: "0",
        description: "Perfect for side projects.",
        features: ["5 Active Workflows", "1,000 Executions/mo", "Community Support"],
        cta: "Start Free",
        buttonVariant: "secondary"
    },
    {
        name: "Pro",
        price: "49",
        description: "For growing teams.",
        features: ["Unlimited Workflows", "50,000 Executions/mo", "Advanced Analytics", "Priority Support"],
        cta: "Get Started",
        buttonVariant: "primary",
        popular: true
    },
    {
        name: "Enterprise",
        price: "Custom",
        description: "For large scale needs.",
        features: ["Dedicated Infrastructure", "SSO & SAML", "SLA Guarantee", "Dedicated Account Manager"],
        cta: "Contact Sales",
        buttonVariant: "secondary"
    }
];

export default function Pricing() {
    return (
        <section id="pricing" className="py-24 relative bg-transparent">
            <div className="container mx-auto px-4 z-10 relative">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-extrabold mb-4 text-slate-900 tracking-tight">Simple, Transparent Pricing</h2>
                    <p className="text-slate-600 text-lg max-w-xl mx-auto leading-relaxed">Start small and scale your infrastructure as your AI requirements grow.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {plans.map((plan, index) => (
                        <div
                            key={index}
                            className={`relative rounded-3xl p-8 flex flex-col transition-all duration-300 ${plan.popular
                                ? 'bg-gradient-to-b from-blue-50 to-white border-2 border-blue-500 shadow-xl shadow-blue-500/10 md:-translate-y-4'
                                : 'bg-white border border-slate-200 shadow-sm'
                                }`}
                        >
                            {plan.popular && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase shadow-md">
                                    Popular
                                </div>
                            )}

                            <div className="mb-8">
                                <h3 className="text-xl font-bold mb-2 text-slate-900">{plan.name}</h3>
                                <div className="flex items-baseline gap-1 mb-2 text-slate-900">
                                    {plan.price !== "Custom" && <span className="text-3xl font-bold">$</span>}
                                    <span className="text-5xl font-extrabold tracking-tight">{plan.price}</span>
                                    {plan.price !== "Custom" && <span className="text-slate-500 font-medium">/mo</span>}
                                </div>
                                <p className="text-slate-600 text-sm">{plan.description}</p>
                            </div>

                            <div className="flex-grow">
                                <ul className="flex flex-col gap-4 mb-8">
                                    {plan.features.map((feature, fIndex) => (
                                        <li key={fIndex} className="flex items-center gap-3">
                                            <Check className="w-5 h-5 text-blue-600 shrink-0" />
                                            <span className="text-sm font-medium text-slate-700">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <Link
                                href="/signup"
                                className={`w-full py-3 rounded-xl font-bold text-center transition-all ${plan.buttonVariant === 'primary'
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:-translate-y-0.5'
                                    : 'bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 hover:border-slate-300'
                                    }`}
                            >
                                {plan.cta}
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
