import React from 'react';

export default function ShortDescription() {
    return (
        <div className="mt-16 mb-20 text-center max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">Why <span className="text-[#6E62E5]">Cryptalk</span>?</h2>
            <p className="text-gray-400 text-lg leading-relaxed">
                In an age of surveillance capitalism, privacy is an act of rebellion. 
                Cryptalk isn't just a chat app; it's a <span className="text-white">secure tunnel</span> through the noise of the internet. 
                We don't sell your data because we don't have it.
            </p>
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-[#6E62E5] to-transparent mx-auto opacity-50"></div>
        </div>
    );
}
