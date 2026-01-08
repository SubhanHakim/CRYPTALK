import React from 'react';
import Navbar from '../components/landing/Navbar';
import HeroSection from '../components/landing/HeroSection';
import ShortDescription from '../components/landing/ShortDescription';
import FeaturesGrid from '../components/landing/FeaturesGrid';
import HowItWorks from '../components/landing/HowItWorks';
import TrustSection from '../components/landing/TrustSection';
import FaqSection from '../components/landing/FaqSection';
import CtaSection from '../components/landing/CtaSection';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-[#6E62E5] selection:text-white overflow-x-hidden relative">
            
            {/* Technical Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505] pointer-events-none"></div>

            <Navbar />

            <main className="relative z-10 pt-24 pb-20 px-6 max-w-7xl mx-auto">
                <HeroSection />
                <ShortDescription />
                <FeaturesGrid />
                <HowItWorks />
                <TrustSection />
                <FaqSection />
                <CtaSection />
            </main>
        </div>
    );
}
