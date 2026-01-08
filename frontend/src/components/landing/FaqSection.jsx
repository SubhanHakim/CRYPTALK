import React from 'react';

export default function FaqSection() {
    const faqs = [
        { q: 'Is my data stored on your servers?', a: 'Only encrypted blobs are stored temporarily. We hold no keys. If we were raided, we would have nothing useful to hand over.' },
        { q: 'What happens if I lose my device?', a: 'You lose your messages. Security means no backdoors, not even for account recovery. We prioritize privacy over convenience.' },
        { q: 'How is this different from WhatsApp/Signal?', a: 'No phone number required. No centralized identity. You are truly anonymous, not just "private".' },
        { q: 'Is it free?', a: 'Yes. Cryptalk is open-source and free forever. We are funded by community donations, not ad revenue.' }
    ];

    return (
        <div className="mt-40 mb-20 border-t border-white/5 pt-20 max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-12 text-center">Frequently Asked <span className="text-[#6E62E5]">Questions</span></h2>
            
            <div className="space-y-6">
                {faqs.map((faq, i) => (
                    <div key={i} className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 hover:border-[#6E62E5]/50 transition-colors">
                        <h3 className="text-lg font-bold text-white mb-2">{faq.q}</h3>
                        <p className="text-gray-400 leading-relaxed">{faq.a}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
