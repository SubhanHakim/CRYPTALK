import React from 'react';

export default function FeaturesGrid() {
    const features = [
        { title: 'Zero Knowledge Arch', desc: 'We structured our database so we literally cannot read your messages even under subpoena.' },
        { title: 'Disposable Identity', desc: 'No phone numbers. No email verification. Create an account, chat, and delete it forever.' },
        { title: 'P2P File Transfer', desc: 'Send heavy files encrypted directly to your peer. Fast, secure, and limitless.' }
    ];

    return (
        <div id="mission" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((item, i) => (
                <div key={i} className="p-8 border border-white/10 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                    <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
            ))}
        </div>
    );
}
