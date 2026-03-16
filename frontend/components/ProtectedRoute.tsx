"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem("user");
            if (!stored) {
                router.push("/login");
            } else {
                setUser(JSON.parse(stored));
            }
        } catch {
            router.push("/login");
        } finally {
            setLoading(false);
        }
    }, [router]);

    if (loading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 font-sans">
                <span className="text-slate-500 font-medium tracking-wide animate-pulse">Authenticating...</span>
            </div>
        );
    }

    if (!user) {
        return null; // Will redirect in useEffect
    }

    return <>{children}</>;
}
