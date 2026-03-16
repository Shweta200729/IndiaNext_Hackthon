"use client";

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);

        try {
            const res = await fetch("http://localhost:8000/api/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: username,
                    email,
                    phone,
                    password,
                    confirm_password: confirmPassword,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || "Signup failed. Please try again.");
                return;
            }

            setSuccess("Account created successfully! Redirecting to login...");
            setTimeout(() => {
                router.push('/login');
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="min-h-screen w-full flex flex-col md:flex-row-reverse bg-[#F6F9F8] font-sans">

            {/* Brand Logo - Fixed Top Left */}
            <div className="absolute top-8 left-8 sm:top-12 sm:left-12 flex items-center gap-3 z-20">
                <div className="grid grid-cols-3 gap-[3px]">
                    {/* Creating the 9-dot grid logo mapped to the reference */}
                    {[...Array(9)].map((_, i) => (
                        <div key={i} className={`w-[6px] h-[6px] rounded-full ${i % 2 === 0 ? 'bg-[#53a292]' : 'bg-slate-300'}`} />
                    ))}
                </div>
                <span className="text-xl font-bold text-slate-800 tracking-tight">AsyncFL</span>
            </div>

            {/* Left Panel (Visual Content) */}
            <div className="hidden md:flex flex-col w-1/2 items-center justify-center p-12 relative">
                <div className="relative w-full aspect-[4/3] max-w-[500px] mb-8">
                    <Image
                        src="/assets/student-teamwork-illustration.jpeg"
                        alt="Platform Illustration"
                        fill
                        className="object-contain mix-blend-multiply"
                        priority
                    />
                </div>
                <h2 className="text-lg lg:text-xl font-bold text-slate-500 text-center leading-relaxed tracking-tight max-w-sm mt-4">
                    Federated learning just got easier <br /> for AI engineers!
                </h2>
            </div>

            {/* Right Panel (Form Content) */}
            <div className="w-full md:w-1/2 flex items-center justify-center p-8 sm:p-16 bg-white border-r border-slate-100 shadow-[10px_0_30px_rgb(0,0,0,0.02)] z-10">

                <div className="w-full max-w-[380px] flex flex-col">

                    <h1 className="text-[32px] font-bold text-[#53a292] mb-10 tracking-tight">Sign Up</h1>

                    <form className="flex flex-col gap-[18px]" onSubmit={handleSignup}>

                        {error && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-200">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md border border-green-200">
                                {success}
                            </div>
                        )}

                        {/* Inputs */}
                        <div>
                            <input
                                type="text"
                                placeholder="User name..."
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                className="w-full border border-gray-200 rounded-md px-4 py-[14px] text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#53a292] focus:border-[#53a292] transition-colors bg-white shadow-sm"
                            />
                        </div>

                        <div>
                            <input
                                type="email"
                                placeholder="Email address..."
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full border border-gray-200 rounded-md px-4 py-[14px] text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#53a292] focus:border-[#53a292] transition-colors bg-white shadow-sm"
                            />
                        </div>

                        <div>
                            <input
                                type="tel"
                                placeholder="Phone number..."
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required
                                className="w-full border border-gray-200 rounded-md px-4 py-[14px] text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#53a292] focus:border-[#53a292] transition-colors bg-white shadow-sm"
                            />
                        </div>

                        <div>
                            <input
                                type="password"
                                placeholder="Password..."
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full border border-gray-200 rounded-md px-4 py-[14px] text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#53a292] focus:border-[#53a292] transition-colors bg-white shadow-sm"
                            />
                        </div>

                        <div>
                            <input
                                type="password"
                                placeholder="Confirm password..."
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="w-full border border-gray-200 rounded-md px-4 py-[14px] text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#53a292] focus:border-[#53a292] transition-colors bg-white shadow-sm"
                            />
                        </div>

                        {/* Options */}
                        <div className="flex items-center justify-between mt-1 mb-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="terms"
                                    className="w-[15px] h-[15px] rounded border-gray-300 text-[#53a292] focus:ring-[#53a292] cursor-pointer"
                                />
                                <label htmlFor="terms" className="text-xs text-slate-400 font-medium cursor-pointer hover:text-slate-600 transition-colors">
                                    Keep me signed in
                                </label>
                            </div>
                            <Link href="/login" className="text-xs font-semibold text-[#53a292] hover:text-[#3d7a6e] transition-colors tracking-wide">
                                Log In Instead?
                            </Link>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#2C343D] hover:bg-[#1a2026] text-white font-bold py-3.5 rounded-md shadow-sm transition-colors mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? "Creating Account..." : "Sign Up"}
                        </button>

                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-4 my-8">
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-[11px] font-medium text-slate-300 lowercase px-2">or</span>
                        <div className="flex-1 h-px bg-slate-100" />
                    </div>

                    {/* Google Button */}
                    <button className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-md py-3 shadow-sm hover:bg-slate-50 transition-colors group">
                        <svg className="w-[18px] h-[18px] group-hover:scale-105 transition-transform" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        <span className="text-[13px] font-semibold text-slate-500">Continue with Google</span>
                    </button>

                </div>
            </div>

        </div>
    );
}
