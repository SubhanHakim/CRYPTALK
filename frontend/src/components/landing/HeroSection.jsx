import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function HeroSection() {
    const navigate = useNavigate();
    return (
        <div className="flex flex-col md:flex-row items-center justify-between gap-16">
            {/* Left Content */}
            <div className="flex-1 text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-[#6E62E5] mb-8 w-fit">
                    <span className="w-2 h-2 rounded-full bg-[#6E62E5] animate-pulse"></span>
                    PROTOCOL V.1.0 ONLINE
                </div>
                
                <h1 className="text-5xl md:text-7xl font-bold leading-[1.1] mb-6 tracking-tight">
                    Speak Freely in a <br/>
                    <span className="text-[#6E62E5]">Silent World.</span>
                </h1>
                
                <p className="text-lg text-gray-400 mb-10 max-w-xl leading-relaxed">
                    No trackers. No logs. No middleman. Just you and the person you trust, connected by military-grade AES-256 encryption.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                        onClick={() => navigate('/login')} 
                        className="px-8 py-4 bg-[#6E62E5] hover:bg-[#5b50bf] text-white rounded-lg font-semibold text-lg transition-all shadow-lg shadow-[#6E62E5]/20"
                    >
                        Start Encrypted Chat
                    </button>
                </div>

                <div className="mt-12 flex items-center gap-6 text-sm text-gray-500 font-mono">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                        E2E Encrypted
                    </div>
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                        No Metadata
                    </div>
                        <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                        Open Source
                    </div>
                </div>
            </div>

            {/* Right Visual (Interactive Terminal-ish) */}
            <div className="flex-1 w-full max-w-lg relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#6E62E5] to-purple-600 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative bg-[#0A0A0A] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                    {/* Window Header */}
                    <div className="bg-[#111] px-4 py-3 flex items-center gap-2 border-b border-white/5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                        <div className="ml-auto text-xs text-gray-600 font-mono">secure_channel_d7a.socket</div>
                    </div>
                    
                    {/* Window Content */}
                    <div className="p-6 font-mono text-sm space-y-4 min-h-[300px]">
                        <div className="text-gray-500 text-xs mb-4">
                            [SYSTEM] Handshake initiated...<br/>
                            [SYSTEM] Public Key Exchanged.<br/>
                            [SYSTEM] Channel Secured (AES-GCM).
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded bg-[#6E62E5]/20 text-[#6E62E5] flex items-center justify-center text-xs">A</div>
                            <div className="bg-[#151515] p-3 rounded-lg rounded-tl-none border border-white/5 text-gray-300 max-w-[80%]">
                                Is this connection really safe?
                            </div>
                        </div>

                        <div className="flex items-start gap-3 flex-row-reverse">
                            <div className="w-6 h-6 rounded bg-green-500/20 text-green-400 flex items-center justify-center text-xs">Y</div>
                            <div className="bg-[#6E62E5]/10 p-3 rounded-lg rounded-tr-none border border-[#6E62E5]/20 text-indigo-100 max-w-[80%]">
                                Yes. The server only sees random noise. The keys never leave our devices.
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-4 opacity-50">
                            <span className="text-[#6E62E5]">❯</span>
                            <span className="w-2 h-4 bg-[#6E62E5] animate-pulse"></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
