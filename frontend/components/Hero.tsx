"use client";

import * as React from 'react';
import {
    FloatingIconsHero,
    type FloatingIconsHeroProps,
} from '@/components/ui/floating-icons-hero-section';

import {
    Brain,
    Cpu,
    Network,
    Database,
    Cloud,
    Shield,
    Zap,
    Lock,
    Server,
    Activity,
    Code,
    Terminal,
    Globe,
    Wifi,
    HardDrive,
    Monitor
} from 'lucide-react';

const demoIcons: FloatingIconsHeroProps['icons'] = [
    { id: 1, icon: Brain, className: 'top-[10%] left-[10%]' },
    { id: 2, icon: Cpu, className: 'top-[20%] right-[8%]' },
    { id: 3, icon: Network, className: 'top-[80%] left-[10%]' },
    { id: 4, icon: Database, className: 'bottom-[10%] right-[10%]' },
    { id: 5, icon: Cloud, className: 'top-[5%] left-[30%]' },
    { id: 6, icon: Shield, className: 'top-[5%] right-[30%]' },
    { id: 7, icon: Zap, className: 'bottom-[8%] left-[25%]' },
    { id: 8, icon: Lock, className: 'top-[40%] left-[15%]' },
    { id: 9, icon: Server, className: 'top-[75%] right-[25%]' },
    { id: 10, icon: Activity, className: 'top-[90%] left-[70%]' },
    { id: 11, icon: Code, className: 'top-[50%] right-[5%]' },
    { id: 12, icon: Terminal, className: 'top-[55%] left-[5%]' },
    { id: 13, icon: Globe, className: 'top-[5%] left-[55%]' },
    { id: 14, icon: Wifi, className: 'bottom-[5%] right-[45%]' },
    { id: 15, icon: HardDrive, className: 'top-[25%] right-[20%]' },
    { id: 16, icon: Monitor, className: 'top-[60%] left-[30%]' },
];

export default function Hero() {
    return (
        <FloatingIconsHero
            title="Accelerate AI Innovation"
            subtitle="Secure, scalable infrastructure for building the next generation of artificial intelligence. Orchestrate complex workflows with unparalleled efficiency."
            ctaText="Start Building Now"
            ctaHref="/signup"
            icons={demoIcons}
        />
    );
}
