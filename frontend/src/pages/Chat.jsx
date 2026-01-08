import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cryptoLib } from '../lib/crypto';
import { api, API_URL } from '../lib/api';

export default function Chat() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [chats, setChats] = useState([]); // List of contacts/groups
    const [activeChat, setActiveChat] = useState(null); // { type: 'user'|'group', id, name }
    const [messages, setMessages] = useState({}); // Map chatKey -> [msgs]
    const [input, setInput] = useState("");
    const [secretKey, setSecretKey] = useState("default-demo-key");
    const secretKeyRef = useRef(secretKey); // Ref to access latest key without re-running effect
    const ws = useRef(null);
    const chatEndRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => { secretKeyRef.current = secretKey; }, [secretKey]);

    useEffect(() => {
        cryptoLib.init();
        const storedUser = localStorage.getItem('user');
        if (!storedUser) {
            navigate('/login');
            return;
        }
        const u = JSON.parse(storedUser);
        setUser(u);
        refreshChats(u.id);

        const connect = () => {
            if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
                return; // Already connecting or connected
            }

            console.log("Connecting to WebSocket...");
            const wsProtocol = API_URL.startsWith("https") ? "wss" : "ws";
            const wsHost = API_URL.replace(/^https?:\/\//, "");
            ws.current = new WebSocket(`${wsProtocol}://${wsHost}/ws/${u.id}`);

            ws.current.onopen = () => {
                console.log("WebSocket Connected");
            };

            ws.current.onmessage = async (event) => {
                try {
                    const content = event.data;
                    const payload = JSON.parse(content);
                    const currentKey = secretKeyRef.current;

                    if (payload.sender_id == u.id) return; // Ignore self

                    const chatKey = payload.target === 'group'
                        ? `group_${payload.target_id}`
                        : `user_${payload.sender_id}`;

                    let displayNum = payload.type === 'file' ? "[File]" : payload.data;
                    let isFile = payload.type === 'file';
                    let fileData = isFile ? payload : null;

                    if (!isFile && payload.data) {
                        try { displayNum = await cryptoLib.decryptChaCha(payload.data, currentKey); }
                        catch (e) { displayNum = "Decryption Failed"; }
                    }

                    addMessage(chatKey, {
                        text: displayNum,
                        isMine: payload.sender_id == u.id,
                        sender: payload.sender_username,
                        isFile,
                        fileData
                    });

                    if (payload.target === 'user' && payload.sender_id != u.id) {
                        refreshChats(u.id);
                    }
                } catch (e) { console.log("WS Message Error", e); }
            };

            ws.current.onclose = () => {
                console.log("WebSocket Closed. Reconnecting...");
                setTimeout(connect, 3000);
            };

            ws.current.onerror = (err) => {
                console.error("WebSocket Error:", err);
                ws.current.close();
            };
        };

        connect();

        return () => {
            // Cleanup: remove handlers to prevent loops if re-mounting, but maybe let it run?
            // If we close here, the onclose will trigger reconnect... infinite loop if navigating away?
            // We should nullify onclose before closing.
            if (ws.current) {
                ws.current.onclose = null; // Disable auto-reconnect on unmount
                ws.current.close();
            }
        };
    }, [navigate]);

    // Handle Android/Browser Back Button
    useEffect(() => {
        const handlePopState = (event) => {
            if (activeChat) {
                // If we are in a chat view, back button should close the chat, not exit the app
                setActiveChat(null);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [activeChat]);

    const openChat = (chat) => {
        setActiveChat(chat);
        // Push state so back button works
        window.history.pushState({ chat: chat.id }, "");
    };

    const handleBack = () => {
        if (window.history.state) {
            window.history.back();
        } else {
            setActiveChat(null);
        }
    };

    const refreshChats = async (uid) => {
        try {
            const res = await api.get(`/users/${uid}/chats`);
            const mapped = [
                ...res.users.map(c => ({ type: 'user', id: c.id, name: c.username })),
                ...res.groups.map(g => ({ type: 'group', id: g.id, name: g.name }))
            ];
            setChats(mapped);
        } catch (e) { console.error("Failed to load chats", e); }
    };

    const getChatKey = (c) => c ? `${c.type}_${c.id}` : null;

    const addMessage = (key, msg) => {
        setMessages(prev => ({
            ...prev,
            [key]: [...(prev[key] || []), msg]
        }));
    };

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(scrollToBottom, [messages, activeChat]);

    const sendMessage = async () => {
        if (!input.trim() || !activeChat) return;
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            alert("Connection lost. Please wait for reconnection...");
            return;
        }

        let encData = input;
        try {
            encData = await cryptoLib.encryptChaCha(input, secretKey);
        } catch (e) { return; }

        const payload = {
            target: activeChat.type,
            target_id: activeChat.id,
            sender_id: user.id,
            sender_username: user.username,
            type: 'text',
            data: encData
        };

        try {
            ws.current.send(JSON.stringify(payload));
            addMessage(getChatKey(activeChat), { text: input, isMine: true });
            setInput("");
        } catch (e) {
            alert("Failed to send: " + e.message);
        }
    };

    const [modal, setModal] = useState(null); // { type: 'contact' | 'group' }

    const handleAddContact = () => {
        setModal({ type: 'contact' });
    };

    const handleCreateGroup = () => {
        setModal({ type: 'group' });
    };

    const submitAddContact = async (e) => {
        e.preventDefault();
        const username = e.target.username.value;
        if (!username) return;
        
        try {
            await api.post(`/users/${user.id}/contacts`, { username });
            refreshChats(user.id);
            setModal(null);
        } catch (e) { alert("Failed to add: " + e.message); }
    };

    const submitCreateGroup = async (e) => {
        e.preventDefault();
        const name = e.target.groupName.value;
        const membersStr = e.target.members.value;
        if (!name) return;

        try {
            const members = membersStr ? membersStr.split(',').map(s => s.trim()) : [];
            await api.post(`/users/${user.id}/groups`, { name, members });
            refreshChats(user.id);
            setModal(null);
        } catch (e) { alert("Failed: " + e.message); }
    };

    // Safe Uint8Array to Base64 conversion to avoid stack overflow
    const arrayBufferToBase64 = (buffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        const chunkSize = 0x8000; // 32KB chunks
        for (let i = 0; i < len; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    };

    const handleFileUpload = async (e) => {
        if (!activeChat) return;
        const file = e.target.files[0];
        if (!file) return;

        // Limit file size to avoid browser crash on mobile (e.g. 50MB)
        if (file.size > 50 * 1024 * 1024) {
            alert("File is too large (Max 50MB)");
            return;
        }

        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            alert("Connection lost. Please wait for reconnection...");
            return;
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const aesResult = await cryptoLib.encryptAES(arrayBuffer);

            // Fix: Use safe conversion instead of spread operator
            const aesKeyBase64 = btoa(String.fromCharCode(...aesResult.key)); // Key is small (32 bytes), safe to spread
            const encryptedKey = await cryptoLib.encryptChaCha(aesKeyBase64, secretKey);

            // Large content needs safe conversion
            const encryptedContentBase64 = arrayBufferToBase64(aesResult.encrypted);

            const payload = {
                target: activeChat.type,
                target_id: activeChat.id,
                sender_id: user.id,
                sender_username: user.username,
                type: 'file',
                fileName: file.name,
                encryptedContent: encryptedContentBase64,
                iv: Array.from(aesResult.iv),
                encryptedKey: encryptedKey
            };

            ws.current.send(JSON.stringify(payload));
            addMessage(getChatKey(activeChat), { text: `Sent file: ${file.name}`, isMine: true });
        } catch (e) {
            console.error(e);
            alert("Failed to process file: " + e.message);
        }
    };

    const handleDownload = async (msg) => {
        if (!msg.fileData) return;
        try {
            const { encryptedKey, encryptedContent, iv, fileName } = msg.fileData;
            const aesKeyBase64 = await cryptoLib.decryptChaCha(encryptedKey, secretKey);
            const keyRaw = Uint8Array.from(atob(aesKeyBase64), c => c.charCodeAt(0));
            const contentRaw = Uint8Array.from(atob(encryptedContent), c => c.charCodeAt(0));
            const ivRaw = new Uint8Array(iv);
            const decryptedBuffer = await cryptoLib.decryptAES(contentRaw, keyRaw, ivRaw);
            const blob = new Blob([decryptedBuffer]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { alert("Decryption Error"); }
    };

    const getFileType = (fileName) => {
        if (!fileName) return 'unknown';
        const ext = fileName.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
        if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
        if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio';
        return 'unknown';
    };

    const handleViewMedia = async (msg, index) => {
        if (!msg.fileData) return;
        try {
            const { encryptedKey, encryptedContent, iv, fileName } = msg.fileData;
            // Decrypt Logic
            const aesKeyBase64 = await cryptoLib.decryptChaCha(encryptedKey, secretKey);
            const keyRaw = Uint8Array.from(atob(aesKeyBase64), c => c.charCodeAt(0));
            const contentRaw = Uint8Array.from(atob(encryptedContent), c => c.charCodeAt(0));
            const ivRaw = new Uint8Array(iv);
            const decryptedBuffer = await cryptoLib.decryptAES(contentRaw, keyRaw, ivRaw);

            // Determine MIME
            let mime = 'application/octet-stream';
            const type = getFileType(fileName);
            if (type === 'image') mime = 'image/' + fileName.split('.').pop(); // rough guess
            if (type === 'video') mime = 'video/mp4'; // most common
            if (type === 'audio') mime = 'audio/mpeg';

            const blob = new Blob([decryptedBuffer], { type: mime });
            const url = URL.createObjectURL(blob);

            // Update Message State
            const key = getChatKey(activeChat);
            setMessages(prev => {
                const list = [...(prev[key] || [])];
                list[index] = { ...list[index], previewUrl: url };
                return { ...prev, [key]: list };
            });

        } catch (e) { alert("Decrypt/View Error: " + e.message); }
    };

    if (user && !user.is_setup) {
        return (
            <div className="fixed inset-0 min-h-screen bg-[#050505] text-white font-sans selection:bg-[#6E62E5] selection:text-white flex items-center justify-center z-50 overflow-hidden">
                {/* Background Effects */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505] pointer-events-none"></div>

                <div className="relative z-10 w-full max-w-md p-6">
                    <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
                        
                         {/* Subtle glow effect on hover */}
                        <div className="absolute -inset-1 bg-gradient-to-r from-[#6E62E5]/20 to-purple-600/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-1000"></div>
                        
                        <div className="relative z-10">
                            <div className="mb-6 text-center">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#6E62E5]/10 text-[#6E62E5] mb-4">
                                     <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                </div>
                                <h2 className="text-2xl font-bold text-white">Setup Profile</h2>
                                <p className="text-sm text-gray-400 mt-2">Create your anonymous identity</p>
                            </div>

                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                const newName = e.target.username.value;
                                if (!newName) return;
                                try {
                                    const updated = await api.put(`/users/${user.id}/username`, { username: newName });
                                    const newUser = { ...user, username: updated.username, is_setup: true };
                                    localStorage.setItem('user', JSON.stringify(newUser));
                                    setUser(newUser);
                                } catch (err) { alert("Error updating username"); }
                            }} className="space-y-6">
                                
                                <div className="space-y-2">
                                    <label className="text-xs font-mono text-gray-500 uppercase tracking-wider ml-1">Username / Alias</label>
                                    <div className="relative">
                                        <input 
                                            name="username" 
                                            defaultValue={user.username} 
                                            className="w-full bg-[#050505] border border-white/10 p-4 rounded-xl text-white focus:outline-none focus:border-[#6E62E5] focus:ring-1 focus:ring-[#6E62E5] transition-all placeholder-gray-600" 
                                            placeholder="e.g. Ghost_01" 
                                            autoFocus
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    type="submit" 
                                    className="w-full py-4 bg-[#6E62E5] hover:bg-[#5b50bf] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#6E62E5]/20 hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Initialize Secure Session
                                </button>
                                
                                <p className="text-center text-[10px] text-gray-600 font-mono mt-4">
                                    Your username is public. No other data is stored.
                                </p>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Generate random color for avatar based on name
    const getAvatarColor = (name) => {
        const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    return (
        <div className="flex h-screen bg-[#050505] text-white font-sans overflow-hidden fixed leading-relaxed selection:bg-[#6E62E5] selection:text-white inset-0">
             {/* Background Effects */}
             <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none z-0"></div>
             
            {/* Sidebar (List View) */}
            <div className={`flex-col h-full bg-[#050505]/80 backdrop-blur-xl border-r border-white/5 relative z-10
                ${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 transition-all duration-300`}>

                {/* Header */}
                <div className="p-5 border-b border-white/5">
                    <div className="flex justify-between items-center mb-6">
                         <div className="flex items-center gap-2">
                             <img src="/logo.png" className="w-6 h-6 opacity-80" alt="logo" />
                            <span className="font-bold tracking-tight text-lg">MESSAGES</span>
                         </div>
                        <button onClick={() => { localStorage.clear(); navigate('/login') }} className="text-gray-500 hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        </button>
                    </div>
                    
                    {/* User Info & Secret Key */}
                    <div className="bg-white/5 border border-white/5 rounded-xl p-3 mb-4">
                        <div className="text-[10px] text-gray-500 font-mono mb-1 uppercase tracking-wider">Identity</div>
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-sm truncate max-w-[150px]">{user?.username}</span>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                <span className="text-[10px] text-green-500 font-mono">ONLINE</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative group">
                         <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <svg className="w-4 h-4 text-gray-500 group-focus-within:text-[#6E62E5] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        </div>
                        <input
                            type="password"
                            placeholder="Enter Secret Key..."
                            value={secretKey}
                            onChange={e => setSecretKey(e.target.value)}
                            className="w-full bg-[#0A0A0A] border border-white/10 p-2.5 pl-10 rounded-lg text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-[#6E62E5] focus:ring-1 focus:ring-[#6E62E5] transition-all"
                        />
                    </div>
                </div>

                {/* Chat List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button onClick={handleAddContact} className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 p-3 rounded-xl flex flex-col items-center justify-center gap-2 transition-all group">
                            <div className="w-8 h-8 rounded-full bg-[#6E62E5]/10 text-[#6E62E5] flex items-center justify-center group-hover:scale-110 transition-transform">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            <span className="text-[10px] font-medium text-gray-400">New Chat</span>
                        </button>
                        <button onClick={handleCreateGroup} className="bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 p-3 rounded-xl flex flex-col items-center justify-center gap-2 transition-all group">
                             <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                            <span className="text-[10px] font-medium text-gray-400">New Group</span>
                        </button>
                    </div>

                    <div className="space-y-1">
                        {chats.map(c => (
                            <div
                                key={getChatKey(c)}
                                onClick={() => openChat(c)}
                                className={`group p-3 rounded-xl cursor-pointer transition-all flex items-center gap-3 border border-transparent
                                    ${activeChat?.id === c.id && activeChat?.type === c.type
                                        ? 'bg-[#6E62E5]/10 border-[#6E62E5]/20'
                                        : 'hover:bg-white/5 hover:border-white/5'
                                    }`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-inner relative
                                    ${activeChat?.id === c.id ? 'ring-2 ring-[#6E62E5] ring-offset-2 ring-offset-[#050505]' : ''}
                                    ${getAvatarColor(c.name)}`}>
                                    {c.name.substring(0, 2).toUpperCase()}
                                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[#050505] rounded-full"></div>
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <h3 className={`text-sm font-semibold truncate ${activeChat?.id === c.id ? 'text-white' : 'text-gray-300'}`}>{c.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${c.type === 'group' ? 'border-purple-500/30 text-purple-400' : 'border-blue-500/30 text-blue-400'}`}>
                                            {c.type === 'group' ? 'GRP' : 'P2P'}
                                        </span>
                                        <p className="text-xs text-gray-500 truncate">Encrypted</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Chat View (Detail View) */}
            <div className={`flex-col h-full relative flex-1 bg-transparent z-10
                ${!activeChat ? 'hidden md:flex' : 'flex'} w-full`}>

                {!activeChat ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-4 text-center">
                        <div className="w-24 h-24 rounded-full border border-white/10 bg-white/5 flex items-center justify-center mb-6 relative group">
                            <div className="absolute inset-0 bg-[#6E62E5]/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                            <svg className="w-10 h-10 text-gray-400 relative z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Secure Channel Ready</h3>
                        <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
                            Select a contact from the sidebar to establish a <span className="text-[#6E62E5]">ChaCha20-Poly1305</span> encrypted tunnel.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="px-6 py-4 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md flex items-center sticky top-0 z-20">
                            <button
                                onClick={handleBack}
                                className="mr-4 md:hidden p-2 -ml-2 text-gray-400 hover:text-white transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white mr-4 shadow-lg ${getAvatarColor(activeChat.name)}`}>
                                {activeChat.name.substring(0, 2).toUpperCase()}
                            </div>

                            <div>
                                <h3 className="font-bold text-white text-lg tracking-tight">{activeChat.name}</h3>
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-[#6E62E5] rounded-full animate-pulse"></span>
                                    <p className="text-[10px] font-mono text-[#6E62E5] tracking-wider uppercase">End-to-End Encrypted</p>
                                </div>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar">
                            {(messages[getChatKey(activeChat)] || []).map((m, i) => {
                                const fileType = m.isFile ? getFileType(m.fileData?.fileName) : null;
                                return (
                                    <div key={i} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'} animate-fade-in-up group`}>
                                        <div className={`max-w-[85%] md:max-w-xl relative
                                            ${m.isMine ? 'items-end flex flex-col' : 'items-start flex flex-col'}`}>
                                            
                                            {!m.isMine && (
                                                <span className="text-[10px] font-mono text-gray-500 mb-1 ml-1">{m.sender}</span>
                                            )}

                                            <div className={`p-4 rounded-2xl shadow-sm backdrop-blur-sm border
                                                ${m.isMine
                                                    ? 'bg-[#6E62E5] text-white rounded-br-none border-[#6E62E5]'
                                                    : 'bg-[#111] text-gray-200 rounded-bl-none border-white/10'}`}>

                                                {m.isFile ? (
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg border border-white/5">
                                                            <div className="p-2.5 bg-white/10 rounded-lg">
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.586l5.414 5.414a1 1 0 01.586 1.414V19a2 2 0 01-2 2z" /></svg>
                                                            </div>
                                                            <div className="overflow-hidden">
                                                                <p className="text-sm font-medium truncate max-w-[180px]">{m.fileData?.fileName}</p>
                                                                <p className="text-[10px] opacity-60 uppercase">Encrypted File</p>
                                                            </div>
                                                        </div>

                                                        {m.previewUrl ? (
                                                            <div className="mt-2 rounded-lg overflow-hidden border border-white/10 bg-black/50">
                                                                {fileType === 'image' && <img src={m.previewUrl} alt="Encrypted Media" className="w-full h-auto max-h-80 object-contain" />}
                                                                {fileType === 'video' && <video src={m.previewUrl} controls className="w-full max-h-80" />}
                                                                {fileType === 'audio' && <audio src={m.previewUrl} controls className="w-full p-2" />}
                                                            </div>
                                                        ) : (
                                                            <div className="flex gap-2 mt-1">
                                                                <button onClick={() => handleDownload(m)} className="text-xs bg-white/10 hover:bg-white/20 border border-white/10 px-4 py-2 rounded-lg transition-all flex items-center gap-2">
                                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                                    Download
                                                                </button>
                                                                {['image', 'video', 'audio'].includes(fileType) && (
                                                                    <button onClick={() => handleViewMedia(m, i)} className="text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 px-4 py-2 rounded-lg transition-all flex items-center gap-2">
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                                        View Content
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed tracking-wide">{m.text}</p>
                                                )}
                                            </div>
                                            
                                            <span className="text-[10px] text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity select-none font-mono">
                                                {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-transparent pb-6 sticky bottom-0 z-20">
                             <div className="flex items-end gap-3 max-w-4xl mx-auto bg-[#111111] border border-white/10 p-2 rounded-3xl shadow-2xl backdrop-blur-xl">
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                                <button onClick={() => fileInputRef.current.click()} className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                </button>
                                
                                <div className="flex-1 py-2">
                                     <input
                                        type="text"
                                        className="w-full bg-transparent text-white border-none focus:ring-0 placeholder-gray-600 text-sm font-sans"
                                        placeholder="Type an encrypted message..."
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    />
                                </div>

                                <button
                                    onClick={sendMessage}
                                    disabled={!input.trim()}
                                    className={`p-3 rounded-full transition-all duration-200 transform hover:scale-105 active:scale-95 flex-shrink-0
                                        ${input.trim() ? 'bg-[#6E62E5] text-white shadow-lg shadow-[#6E62E5]/30' : 'bg-white/5 text-gray-600 cursor-not-allowed'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                </button>
                             </div>
                        </div>
                    </>
                )}
            </div>
            {/* Custom Modals */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                        onClick={() => setModal(null)}
                    ></div>

                    {/* Modal Content */}
                    <div className="relative bg-[#0A0A0A] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl overflow-hidden animate-fade-in-up">
                        {/* Glow Effect */}
                        <div className="absolute -inset-1 bg-gradient-to-r from-[#6E62E5]/20 to-purple-600/20 rounded-2xl blur opacity-50 pointer-events-none"></div>
                        
                        <div className="relative z-10">
                            <h3 className="text-xl font-bold text-white mb-2">
                                {modal.type === 'contact' ? 'New Secure Connnection' : 'Create Secure Group'}
                            </h3>
                            <p className="text-sm text-gray-400 mb-6">
                                {modal.type === 'contact' 
                                    ? 'Enter the username of the peer you wish to connect with.' 
                                    : 'Establish a new encrypted group channel.'}
                            </p>

                            <form onSubmit={modal.type === 'contact' ? submitAddContact : submitCreateGroup} className="space-y-4">
                                {modal.type === 'contact' ? (
                                    <div className="space-y-2">
                                        <label className="text-xs font-mono text-gray-500 uppercase">Target Username</label>
                                        <input 
                                            name="username" 
                                            autoFocus
                                            className="w-full bg-[#111] border border-white/10 p-3 rounded-xl text-white focus:border-[#6E62E5] focus:ring-1 focus:ring-[#6E62E5] outline-none transition-all placeholder-gray-700"
                                            placeholder="e.g. Alice_01"
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-gray-500 uppercase">Group Name</label>
                                            <input 
                                                name="groupName" 
                                                autoFocus
                                                className="w-full bg-[#111] border border-white/10 p-3 rounded-xl text-white focus:border-[#6E62E5] focus:ring-1 focus:ring-[#6E62E5] outline-none transition-all placeholder-gray-700"
                                                placeholder="e.g. Operation Lunar"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-gray-500 uppercase">Members (Comma Separated)</label>
                                            <input 
                                                name="members" 
                                                className="w-full bg-[#111] border border-white/10 p-3 rounded-xl text-white focus:border-[#6E62E5] focus:ring-1 focus:ring-[#6E62E5] outline-none transition-all placeholder-gray-700"
                                                placeholder="e.g. Bob, Charlie, Dave"
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="flex gap-3 mt-6 pt-2">
                                    <button 
                                        type="button"
                                        onClick={() => setModal(null)}
                                        className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        className="flex-1 py-3 bg-[#6E62E5] hover:bg-[#5b50bf] text-white rounded-xl font-bold shadow-lg shadow-[#6E62E5]/20 transition-all hover:scale-[1.02]"
                                    >
                                        {modal.type === 'contact' ? 'Establish Link' : 'Initialize Group'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
