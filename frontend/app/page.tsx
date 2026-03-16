import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import DashboardMockup from '@/components/DashboardMockup';
import Features from '@/components/Features';
import Pricing from '@/components/Pricing';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-slate-50 text-slate-900 flex flex-col selection:bg-blue-200 selection:text-blue-900 font-sans">
      <Navbar />

      <main className="flex-grow">
        {/* Level 1: Hero Section (Transparent base over page gradient) */}
        <Hero />

        {/* Level 2 Alternating: Dashboard in gradient wrapper */}
        <section className="relative w-full py-20 bg-gradient-to-b from-white to-blue-50/40">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-100/50 via-transparent to-transparent opacity-60 pointer-events-none" />
          <DashboardMockup />
        </section>

        {/* Level 2 Alternating: Features on white */}
        <section className="bg-white py-12 relative z-10 border-y border-slate-100 shadow-sm">
          <Features />
        </section>

        {/* Decorative structural element */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent opacity-50" />

        {/* Level 2 Alternating: Pricing on slate */}
        <section className="bg-slate-50 relative z-10 overflow-hidden py-12">
          <div className="absolute w-[800px] h-[400px] bg-blue-100/30 blur-[120px] rounded-full point-events-none -top-40 left-1/2 -translate-x-1/2" />
          <Pricing />
        </section>
      </main>

      <Footer />
    </div>
  );
}
