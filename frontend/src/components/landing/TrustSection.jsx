import React from 'react';

export default function TrustSection() {
    return (
        <div className="mt-40 mb-20 border-t border-white/5 pt-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                <div>
                    <h2 className="text-4xl font-bold mb-6">Don't trust us.<br/><span className="text-[#6E62E5]">Verify us.</span></h2>
                    <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                        Proprietary systems connect you through a black box. 
                        Cryptalk is open-source. Every line of code that handles your encryption 
                        is public for security researchers to audit.
                    </p>
                    
                    <div className="flex gap-8">
                        <div>
                            <div className="text-3xl font-bold text-white">100%</div>
                            <div className="text-sm text-gray-500 uppercase tracking-widest mt-1">Open Source</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-white">0</div>
                            <div className="text-sm text-gray-500 uppercase tracking-widest mt-1">Tracker Scripts</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-white">AES</div>
                            <div className="text-sm text-gray-500 uppercase tracking-widest mt-1">256-bit GCM</div>
                        </div>
                    </div>
                </div>

                <div className="relative bg-[#0A0A0A] rounded-xl border border-white/10 p-8 overflow-hidden group hover:border-[#6E62E5]/50 transition-colors">
                    <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
                        <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div className="font-mono text-sm space-y-2 relative z-10">
                        <div className="text-gray-500">// SECURITY STATUS: VERIFIED</div>
                        <div className="text-green-400">$ verify-integrity ./cryptalk-core</div>
                        <div className="text-gray-400">Verifying cryptographic signatures...</div>
                        <div className="text-gray-400">Checking against transparency log...</div>
                        <div className="text-blue-400">✓ Integrity Check Passed</div>
                        <div className="text-[#6E62E5] mt-4 opacity-80">
                            → All systems operational
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
