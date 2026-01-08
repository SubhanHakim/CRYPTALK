import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Navbar() {
    const navigate = useNavigate();
    return (
        <nav className="relative z-50 w-full border-b border-white/5 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
                <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/login')}>
                    <img src="/logo.png" alt="Logo" className="w-8 h-8 opacity-90 group-hover:scale-110 transition-transform duration-500" />
                    <span className="text-xl font-bold tracking-tight text-white group-hover:text-[#6E62E5] transition-colors">CRYPTALK</span>
                </div>
                <div className="flex items-center gap-6">
                    <a href="#mission" className="hidden md:block text-sm text-gray-400 hover:text-white transition-colors">Mission</a>
                    <a href="#tech" className="hidden md:block text-sm text-gray-400 hover:text-white transition-colors">Technology</a>
                    <button 
                        onClick={() => navigate('/login')}
                        className="bg-white text-black px-5 py-2 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors"
                    >
                        Launch App
                    </button>
                </div>
            </div>
        </nav>
    );
}
