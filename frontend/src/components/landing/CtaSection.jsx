import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function CtaSection() {
    const navigate = useNavigate();
    return (
        <div className="mt-40 mb-32 text-center">
            <h2 className="text-5xl md:text-6xl font-black mb-8 tracking-tighter">Ready to go <span className="text-[#6E62E5]">dark?</span></h2>
            <p className="text-gray-400 text-xl mb-10 max-w-xl mx-auto">
                Join thousands of users who have reclaimed their digital privacy.
            </p>
            <button 
                onClick={() => navigate('/login')} 
                className="px-12 py-5 bg-[#6E62E5] hover:bg-[#5b50bf] text-white rounded-full font-bold text-xl hover:scale-105 hover:shadow-2xl hover:shadow-[#6E62E5]/50 transition-all duration-300"
            >
                Launch Cryptalk
            </button>
            <p className="mt-6 text-sm text-gray-500">No email required • 100% Free • Open Source</p>
        </div>
    );
}
