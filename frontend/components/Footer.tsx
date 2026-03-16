import { Zap, Twitter, Github, Linkedin } from 'lucide-react';
import Link from 'next/link';

export default function Footer() {
    return (
        <footer className="border-t border-slate-200 bg-slate-50 pt-16 pb-8">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-16">

                    {/* Brand & Socials */}
                    <div className="col-span-2">
                        <Link href="/" className="flex items-center gap-2 mb-6">
                            <div className="bg-blue-100 p-1.5 rounded-lg border border-blue-200">
                                <Zap className="w-5 h-5 text-blue-600 fill-blue-600/20" />
                            </div>
                            <span className="text-xl font-bold tracking-tight text-slate-900">FlowPlatform</span>
                        </Link>
                        <p className="text-slate-600 text-sm mb-6 max-w-xs leading-relaxed">
                            Automating the future of work. Build, deploy, and scale enterprise workflows with ease.
                        </p>
                        <div className="flex gap-4">
                            <Link href="#" className="text-slate-500 hover:text-blue-600 transition-colors">
                                <Twitter className="w-5 h-5" />
                            </Link>
                            <Link href="#" className="text-slate-500 hover:text-blue-600 transition-colors">
                                <Github className="w-5 h-5" />
                            </Link>
                            <Link href="#" className="text-slate-500 hover:text-blue-600 transition-colors">
                                <Linkedin className="w-5 h-5" />
                            </Link>
                        </div>
                    </div>

                    {/* Links - Product */}
                    <div>
                        <h4 className="font-bold mb-4 text-slate-900">Product</h4>
                        <ul className="flex flex-col gap-3 text-sm text-slate-600">
                            <li><Link href="#features" className="hover:text-blue-600 transition-colors">Features</Link></li>
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">Integrations</Link></li>
                            <li><Link href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</Link></li>
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">Changelog</Link></li>
                        </ul>
                    </div>

                    {/* Links - Resources */}
                    <div>
                        <h4 className="font-bold mb-4 text-slate-900">Resources</h4>
                        <ul className="flex flex-col gap-3 text-sm text-slate-600">
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">Documentation</Link></li>
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">API Reference</Link></li>
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">Community</Link></li>
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">Blog</Link></li>
                        </ul>
                    </div>

                    {/* Links - Company */}
                    <div>
                        <h4 className="font-bold mb-4 text-slate-900">Company</h4>
                        <ul className="flex flex-col gap-3 text-sm text-slate-600">
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">About</Link></li>
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">Careers</Link></li>
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">Legal</Link></li>
                            <li><Link href="#" className="hover:text-blue-600 transition-colors">Contact</Link></li>
                        </ul>
                    </div>

                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
                    <p>© 2024 FlowPlatform Inc. All rights reserved.</p>
                    <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm text-slate-700">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        All systems operational
                    </div>
                </div>
            </div>
        </footer>
    );
}
