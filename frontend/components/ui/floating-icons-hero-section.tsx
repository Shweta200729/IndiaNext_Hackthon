"use client";

import * as React from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Interface for the props of each individual icon.
export interface IconProps {
    id: number;
    icon: React.ElementType; // Changed to React.ElementType to accept Lucide icons smoothly
    className: string; // Used for custom positioning of the icon.
}

// Interface for the main hero component's props.
export interface FloatingIconsHeroProps {
    title: string;
    subtitle: string;
    ctaText: string;
    ctaHref: string;
    icons: IconProps[];
}

// A single icon component with its own motion logic
const Icon = ({
    mouseX,
    mouseY,
    iconData,
    index,
}: {
    mouseX: React.MutableRefObject<number>;
    mouseY: React.MutableRefObject<number>;
    iconData: IconProps;
    index: number;
}) => {
    const ref = React.useRef<HTMLDivElement>(null);

    // Motion values for the icon's position, with spring physics for smooth movement
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const springX = useSpring(x, { stiffness: 300, damping: 20 });
    const springY = useSpring(y, { stiffness: 300, damping: 20 });

    React.useEffect(() => {
        const handleMouseMove = () => {
            if (ref.current) {
                const rect = ref.current.getBoundingClientRect();
                const distance = Math.sqrt(
                    Math.pow(mouseX.current - (rect.left + rect.width / 2), 2) +
                    Math.pow(mouseY.current - (rect.top + rect.height / 2), 2)
                );

                // If the cursor is close enough, repel the icon
                if (distance < 150) {
                    const angle = Math.atan2(
                        mouseY.current - (rect.top + rect.height / 2),
                        mouseX.current - (rect.left + rect.width / 2)
                    );
                    // The closer the cursor, the stronger the repulsion
                    const force = (1 - distance / 150) * 50;
                    x.set(-Math.cos(angle) * force);
                    y.set(-Math.sin(angle) * force);
                } else {
                    // Return to original position when cursor is away
                    x.set(0);
                    y.set(0);
                }
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [x, y, mouseX, mouseY]);

    const IconComponent = iconData.icon;

    return (
        <motion.div
            ref={ref}
            key={iconData.id}
            style={{
                x: springX,
                y: springY,
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
                delay: index * 0.08,
                duration: 0.6,
                ease: [0.22, 1, 0.36, 1],
            }}
            className={cn('absolute z-0', iconData.className)}
        >
            {/* Inner wrapper for the continuous floating animation */}
            <motion.div
                className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 p-3 rounded-2xl shadow-lg bg-white border border-slate-200"
                animate={{
                    y: [0, -8, 0, 8, 0],
                    x: [0, 6, 0, -6, 0],
                    rotate: [0, 5, 0, -5, 0],
                }}
                transition={{
                    duration: 5 + Math.random() * 5,
                    repeat: Infinity,
                    repeatType: 'mirror',
                    ease: 'easeInOut',
                }}
            >
                <IconComponent className="w-8 h-8 md:w-10 md:h-10 text-blue-600" />
            </motion.div>
        </motion.div>
    );
};

const FloatingIconsHero = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & FloatingIconsHeroProps
>(({ className, title, subtitle, ctaText, ctaHref, icons, ...props }, ref) => {
    // Refs to track the raw mouse position
    const mouseX = React.useRef(0);
    const mouseY = React.useRef(0);

    const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        mouseX.current = event.clientX;
        mouseY.current = event.clientY;
    };

    return (
        <section
            ref={ref}
            onMouseMove={handleMouseMove}
            className={cn(
                'relative w-full h-screen min-h-[700px] flex items-center justify-center overflow-hidden bg-transparent pt-16',
                className
            )}
            {...props}
        >
            {/* Subtle radial gradient behind hero content */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-[800px] h-[800px] bg-blue-100/40 rounded-full blur-[100px]" />
            </div>

            {/* Container for the background floating icons */}
            <div className="absolute inset-0 w-full h-full point-events-none">
                {icons.map((iconData, index) => (
                    <Icon
                        key={iconData.id}
                        mouseX={mouseX}
                        mouseY={mouseY}
                        iconData={iconData}
                        index={index}
                    />
                ))}
            </div>

            {/* Container for the foreground content */}
            <div className="relative z-10 text-center px-4">
                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-blue-700 to-indigo-500 bg-clip-text text-transparent drop-shadow-sm pb-2">
                    {title}
                </h1>
                <p className="mt-8 max-w-xl mx-auto text-lg text-slate-600 leading-relaxed">
                    {subtitle}
                </p>
                <div className="mt-10">
                    <Button asChild size="lg" className="px-8 py-6 text-base font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-600/20 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-600/30 ring-4 ring-transparent hover:ring-blue-100 transition-all duration-300">
                        <a href={ctaHref}>{ctaText}</a>
                    </Button>
                </div>
            </div>
        </section>
    );
});

FloatingIconsHero.displayName = 'FloatingIconsHero';

export { FloatingIconsHero };
