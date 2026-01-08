import React from 'react';

export default function HowItWorks() {
    return (
        <div id="tech" className="mt-32 mb-20">
            <div className="text-center mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-[#6E62E5] mb-4">
                    <span className="w-2 h-2 rounded-full bg-[#6E62E5] animate-pulse"></span>
                    SEQUENCE DIAGRAM
                </div>
                <h2 className="text-3xl font-bold tracking-tight">How <span className="text-[#6E62E5]">It Works</span></h2>
                <p className="text-gray-400 mt-4">Transparent security using proven cryptographic primitives</p>
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Connecting Line (Desktop) */}
                <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[#6E62E5]/50 to-transparent border-t border-dashed border-gray-700 pointer-events-none"></div>

                {[
                    { step: '01', title: 'Key Generation', desc: 'Your device generates a distinct Public & Private Key pair locally in your browser.' },
                    { step: '02', title: 'Secure Handshake', desc: 'We exchange Public Keys via WebSocket. Your Private Key never leaves your device.' },
                    { step: '03', title: 'AES Tunneling', desc: 'Messages are encrypted with AES-256 using a shared secret derived from the handshake.' }
                ].map((item, i) => (
                    <div key={i} className="relative flex flex-col items-center text-center group">
                        <div className="w-24 h-24 rounded-full bg-[#0A0A0A] border border-white/10 flex items-center justify-center mb-6 relative z-10 group-hover:border-[#6E62E5] transition-colors shadow-2xl">
                            <span className="text-2xl font-mono font-bold text-gray-500 group-hover:text-[#6E62E5] transition-colors">{item.step}</span>
                            <div className="absolute inset-0 rounded-full border border-[#6E62E5]/20 scale-110 opacity-0 group-hover:opacity-100 transition-all duration-500"></div>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-xs">{item.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
