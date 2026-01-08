import { useState, useEffect } from 'react';
import { cryptoLib } from '../lib/crypto';

const SIZES = [
    { label: '128 B', bytes: 128 },
    { label: '1 KB', bytes: 1024 },
    { label: '16 KB', bytes: 16 * 1024 },
    { label: '256 KB', bytes: 256 * 1024 },
    { label: '1.0 MB', bytes: 1024 * 1024 },
];

export default function Benchmark() {
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState("");
    const [tableRows, setTableRows] = useState([]);

    useEffect(() => {
        cryptoLib.init();
    }, []);

    const runBenchmark = async () => {
        setRunning(true);
        setTableRows([]);

        try {
            const results = [];
            const key = "benchmark-key-32-bytes-long-test";

            for (const sizeObj of SIZES) {
                const { label, bytes } = sizeObj;
                setProgress(`Benchmarking ${label}...`);

                // Determine iterations based on size to keep reliable but fast
                const iterations = bytes < 10000 ? 500 : (bytes < 300000 ? 100 : 20);

                // Prepare Buffer
                const buffer = new Uint8Array(bytes);
                for (let i = 0; i < bytes; i++) buffer[i] = i & 0xFF;

                // --- 1. AES-256-GCM ---
                let totalEnc = 0, totalDec = 0;
                for (let i = 0; i < iterations; i++) {
                    const t0 = performance.now();
                    const encrypted = await cryptoLib.encryptAES(buffer);
                    const t1 = performance.now();
                    await cryptoLib.decryptAES(encrypted.encrypted, encrypted.key, encrypted.iv);
                    const t2 = performance.now();
                    totalEnc += (t1 - t0);
                    totalDec += (t2 - t1);
                }
                recordResult(results, "AES-256-GCM", label, bytes, totalEnc / iterations, totalDec / iterations);

                // --- 2. ChaCha20-Poly1305 (Buffer) ---
                totalEnc = 0; totalDec = 0;
                for (let i = 0; i < iterations; i++) {
                    const t0 = performance.now();
                    const encObj = await cryptoLib.encryptChaChaBuffer(buffer, key);
                    const t1 = performance.now();
                    await cryptoLib.decryptChaChaBuffer(encObj, key);
                    const t2 = performance.now();
                    totalEnc += (t1 - t0);
                    totalDec += (t2 - t1);
                }
                recordResult(results, "ChaCha20-Poly1305", label, bytes, totalEnc / iterations, totalDec / iterations);

                // --- 3. AES -> ChaCha (Double) ---
                // Encrypt payload with AES, then encrypt AES blob with ChaCha
                totalEnc = 0; totalDec = 0;
                for (let i = 0; i < iterations; i++) {
                    // Encrypt
                    const t0 = performance.now();
                    const aesRes = await cryptoLib.encryptAES(buffer);
                    const chachaRes = await cryptoLib.encryptChaChaBuffer(aesRes.encrypted, key);
                    const t1 = performance.now();

                    // Decrypt
                    // CHA -> AES Payload -> Plain
                    const aesPayload = await cryptoLib.decryptChaChaBuffer(chachaRes, key);
                    await cryptoLib.decryptAES(aesPayload, aesRes.key, aesRes.iv);
                    const t2 = performance.now();

                    totalEnc += (t1 - t0);
                    totalDec += (t2 - t1);
                }
                recordResult(results, "AES→ChaCha (double)", label, bytes, totalEnc / iterations, totalDec / iterations);

                // Update UI incrementally
                setTableRows([...results]);
            }

            setProgress("Completed!");

        } catch (e) {
            console.error(e);
            setProgress("Error: " + e.message);
        } finally {
            setRunning(false);
        }
    };

    const recordResult = (list, algo, sizeLabel, bytes, encMs, decMs) => {
        const encMBs = (bytes / 1024 / 1024) / (encMs / 1000);
        const decMBs = (bytes / 1024 / 1024) / (decMs / 1000);
        list.push({
            algo,
            size: sizeLabel,
            encMs: encMs.toFixed(4),
            decMs: decMs.toFixed(4),
            encMBs: encMBs.toFixed(2),
            decMBs: decMBs.toFixed(2)
        });
    };

    const copyToClipboard = () => {
        let text = "=== SUMMARY TABLE (copy to paper) ===\n";
        text += "| Algo                | Size    | Enc avg (ms) | Dec avg (ms) | Enc MB/s | Dec MB/s |\n";
        text += "|---------------------|---------|--------------|--------------|----------|----------|\n";
        tableRows.forEach(row => {
            text += `| ${row.algo.padEnd(19)} | ${row.size.padEnd(7)} | ${row.encMs.padStart(12)} | ${row.decMs.padStart(12)} | ${row.encMBs.padStart(8)} | ${row.decMBs.padStart(8)} |\n`;
        });
        navigator.clipboard.writeText(text);
        alert("Copied table to clipboard!");
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center">
            <h1 className="text-3xl font-bold mb-6 text-blue-400">Crypto Benchmark</h1>

            <div className="w-full max-w-5xl">
                <div className="flex space-x-4 mb-6">
                    <button
                        onClick={runBenchmark}
                        disabled={running}
                        className={`flex - 1 py - 3 rounded font - bold shadow - lg ${running ? 'bg-gray-600' : 'bg-green-600 hover:bg-green-500'} `}
                    >
                        {running ? progress : "Run Benchmark Suite"}
                    </button>
                    {tableRows.length > 0 && (
                        <button onClick={copyToClipboard} className="bg-gray-700 hover:bg-gray-600 px-6 rounded font-bold">
                            Copy Table
                        </button>
                    )}
                </div>

                {tableRows.length > 0 && (
                    <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-700 text-gray-300">
                                <tr>
                                    <th className="p-3 border-b border-gray-600">Algo</th>
                                    <th className="p-3 border-b border-gray-600">Size</th>
                                    <th className="p-3 border-b border-gray-600">Enc avg (ms)</th>
                                    <th className="p-3 border-b border-gray-600">Dec avg (ms)</th>
                                    <th className="p-3 border-b border-gray-600">Enc MB/s</th>
                                    <th className="p-3 border-b border-gray-600">Dec MB/s</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row, i) => (
                                    <tr key={i} className="border-b border-gray-700 hover:bg-gray-750">
                                        <td className="p-3 font-mono text-sm text-blue-300">{row.algo}</td>
                                        <td className="p-3 font-mono text-sm">{row.size}</td>
                                        <td className="p-3 font-mono text-sm">{row.encMs}</td>
                                        <td className="p-3 font-mono text-sm">{row.decMs}</td>
                                        <td className="p-3 font-mono text-sm text-green-400">{row.encMBs}</td>
                                        <td className="p-3 font-mono text-sm text-green-400">{row.decMBs}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <a href="/" className="mt-8 text-blue-400 hover:underline">Back to Home</a>
        </div>
    );
}
