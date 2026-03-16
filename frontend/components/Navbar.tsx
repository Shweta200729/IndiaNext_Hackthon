import Link from 'next/link';
import { Zap } from 'lucide-react';

export default function Navbar() {
    return (
        <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="bg-blue-100 p-1.5 rounded-lg border border-blue-200">
                            <Zap className="w-5 h-5 text-blue-600 fill-blue-600/20" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-slate-900">FlowPlatform</span>
                    </Link>

                    <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
                        <Link href="#features" className="hover:text-blue-600 transition-colors">Features</Link>
                        <Link href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</Link>
                        <Link href="#demo" className="hover:text-blue-600 transition-colors">Docs</Link>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                        Log In
                    </Link>
                    <Link
                        href="/signup"
                        className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all hover:-translate-y-0.5 hover:shadow-lg ring-2 ring-transparent hover:ring-blue-200"
                    >
                        Get Started
                    </Link>
                </div>
            </div>
        </nav>
    );
}
