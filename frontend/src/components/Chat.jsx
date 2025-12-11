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
    }, [navigate]); // Removed secretKey from dependency

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

    const handleAddContact = async () => {
        const username = prompt("Enter username to search/add:");
        if (!username) return;
        // In the new model, "adding a contact" effectively just means searching and starting a chat.
        // Or explicitly adding to a list. For now, let's keep the explicit add which updates the 'Active Chats' list logic 
        // because our `get_active_chat_users` includes explicit contacts.
        try {
            await api.post(`/users/${user.id}/contacts`, { username });
            refreshChats(user.id);
        } catch (e) { alert("Failed to add: " + e.message); }
    };

    const handleCreateGroup = async () => {
        const name = prompt("Enter Group Name:");
        const members = prompt("Enter member usernames (comma separated):");
        if (!name) return;
        try {
            await api.post(`/users/${user.id}/groups`, { name, members: members ? members.split(',').map(s => s.trim()) : [] });
            refreshChats(user.id);
        } catch (e) { alert("Failed: " + e.message); }
    };

    const handleFileUpload = async (e) => {
        if (!activeChat) return;
        const file = e.target.files[0];
        if (!file) return;

        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            alert("Connection lost. Please wait for reconnection...");
            return;
        }

        const arrayBuffer = await file.arrayBuffer();
        const aesResult = await cryptoLib.encryptAES(arrayBuffer);
        const aesKeyBase64 = btoa(String.fromCharCode(...aesResult.key));
        const encryptedKey = await cryptoLib.encryptChaCha(aesKeyBase64, secretKey);

        const payload = {
            target: activeChat.type,
            target_id: activeChat.id,
            sender_id: user.id,
            sender_username: user.username,
            type: 'file',
            fileName: file.name,
            encryptedContent: btoa(String.fromCharCode(...aesResult.encrypted)),
            iv: Array.from(aesResult.iv),
            encryptedKey: encryptedKey
        };

        try {
            ws.current.send(JSON.stringify(payload));
            addMessage(getChatKey(activeChat), { text: `Sent file: ${file.name}`, isMine: true });
        } catch (e) {
            alert("Failed to send file: " + e.message);
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
            <div className="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
                <div className="bg-gray-800 p-8 rounded shadow-lg max-w-md w-full">
                    <h2 className="text-2xl font-bold mb-4">Setup Profile</h2>
                    <p className="mb-4 text-gray-300">Please choose a unique username to start chatting.</p>
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
                    }}>
                        <input name="username" defaultValue={user.username} className="w-full bg-gray-700 p-2 rounded mb-4 text-white" placeholder="Username" />
                        <button type="submit" className="w-full bg-blue-600 py-2 rounded font-bold">Start Chatting</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
    // Generate random color for avatar based on name
    const getAvatarColor = (name) => {
            const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
            return colors[Math.abs(hash) % colors.length];
        };

    return (
        <div className="flex h-[100dvh] bg-gray-900 text-white font-sans overflow-hidden">
            {/* Sidebar (List View) */}
            <div className={`flex-col h-full bg-gray-900 border-r border-gray-800 
                ${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 transition-all duration-300`}>

                {/* Header */}
                <div className="p-4 bg-gray-900 sticky top-0 z-10 border-b border-gray-800">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Messages</h2>
                        <button onClick={() => { localStorage.clear(); navigate('/login') }} className="text-gray-400 text-sm hover:text-white">Logout</button>
                    </div>
                    {/* User Info & Secret Key Toggle */}
                    <div className="text-xs text-gray-400 mb-2 truncate">
                        Logged in as <span className="text-white font-medium">{user?.username}</span>
                    </div>
                    <div className="relative">
                        <input
                            type="password"
                            placeholder="Secret Key"
                            value={secretKey}
                            onChange={e => setSecretKey(e.target.value)}
                            className="w-full bg-gray-800 p-2 rounded text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Chat List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Actions */}
                    <div className="flex p-2 space-x-2 sticky top-0 bg-gray-900 z-10 border-b border-gray-800">
                        <button onClick={handleAddContact} className="flex-1 bg-gray-800 hover:bg-gray-700 p-2 rounded-lg flex flex-col items-center justify-center space-y-1">
                            <div className="bg-blue-500/10 p-2 rounded-full"><span className="text-blue-400 text-lg">+</span></div>
                            <span className="text-xs text-gray-400">New Chat</span>
                        </button>
                        <button onClick={handleCreateGroup} className="flex-1 bg-gray-800 hover:bg-gray-700 p-2 rounded-lg flex flex-col items-center justify-center space-y-1">
                            <div className="bg-purple-500/10 p-2 rounded-full"><span className="text-purple-400 text-lg">#</span></div>
                            <span className="text-xs text-gray-400">New Group</span>
                        </button>
                    </div>

                    <div className="px-2 pb-20 md:pb-0">
                        {chats.map(c => (
                            <div
                                key={getChatKey(c)}
                                onClick={() => setActiveChat(c)}
                                className={`group p-3 mb-1 rounded-xl cursor-pointer transition-all flex items-center space-x-3
                                    ${activeChat?.id === c.id && activeChat?.type === c.type
                                        ? 'bg-blue-600/20'
                                        : 'hover:bg-gray-800'
                                    }`}
                            >
                                {/* Avatar */}
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-lg ${getAvatarColor(c.name)}`}>
                                    {c.name.substring(0, 2).toUpperCase()}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline">
                                        <h3 className="font-semibold text-white truncate">{c.name}</h3>
                                        {/* Optional: Time or unread badge could go here */}
                                    </div>
                                    <p className="text-sm text-gray-400 truncate">
                                        {c.type === 'group' ? 'Group Chat' : 'Private Chat'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Chat View (Detail View) */}
            <div className={`flex-col h-full relative flex-1 bg-gray-950
                ${!activeChat ? 'hidden md:flex' : 'flex'} w-full`}>

                {!activeChat ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-4 text-center">
                        <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-4 animate-pulse">
                            <span className="text-4xl">💬</span>
                        </div>
                        <h3 className="text-xl font-medium text-gray-300">Select a chat to start messaging</h3>
                        <p className="text-sm mt-2 max-w-xs">End-to-End Encrypted. Neither we nor Google can read your messages.</p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="px-4 py-3 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 flex items-center sticky top-0 z-20">
                            <button
                                onClick={() => setActiveChat(null)}
                                className="mr-4 md:hidden p-2 -ml-2 text-gray-400 hover:text-white rounded-full hover:bg-gray-800 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white mr-3 ${getAvatarColor(activeChat.name)}`}>
                                {activeChat.name.substring(0, 2).toUpperCase()}
                            </div>

                            <div>
                                <h3 className="font-bold text-white">{activeChat.name}</h3>
                                <p className="text-xs text-blue-400 flex items-center">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></span>
                                    Encrypted Connection
                                </p>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar bg-gray-950/50">
                            {(messages[getChatKey(activeChat)] || []).map((m, i) => {
                                const fileType = m.isFile ? getFileType(m.fileData?.fileName) : null;
                                return (
                                    <div key={i} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                                        <div className={`p-3 rounded-2xl max-w-[85%] md:max-w-lg shadow-sm backdrop-blur-sm relative group
                                            ${m.isMine
                                                ? 'bg-blue-600 text-white rounded-br-none'
                                                : 'bg-gray-800 text-gray-100 rounded-bl-none'}`}>

                                            {!m.isMine && <p className={`text-[10px] font-bold mb-1 opacity-75 ${getAvatarColor(m.sender).replace('bg-', 'text-')}`}>{m.sender}</p>}

                                            {m.isFile ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center space-x-2 bg-black/20 p-2 rounded-lg">
                                                        <div className="p-2 bg-white/10 rounded">📄</div>
                                                        <p className="text-sm truncate max-w-[150px]">{m.fileData?.fileName}</p>
                                                    </div>

                                                    {m.previewUrl ? (
                                                        <div className="mt-2 rounded-lg overflow-hidden bg-black/30">
                                                            {fileType === 'image' && <img src={m.previewUrl} alt="Encrypted Media" className="w-full h-auto max-h-60 object-contain" />}
                                                            {fileType === 'video' && <video src={m.previewUrl} controls className="w-full max-h-60" />}
                                                            {fileType === 'audio' && <audio src={m.previewUrl} controls className="w-full" />}
                                                        </div>
                                                    ) : (
                                                        <div className="flex space-x-2 mt-1">
                                                            <button onClick={() => handleDownload(m)} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors">Download</button>
                                                            {['image', 'video', 'audio'].includes(fileType) && (
                                                                <button onClick={() => handleViewMedia(m, i)} className="text-xs bg-green-500/20 text-green-300 hover:bg-green-500/30 px-3 py-1.5 rounded-full transition-colors">View Media</button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="whitespace-pre-wrap break-words text-sm md:text-base leading-relaxed">{m.text}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-3 bg-gray-900 border-t border-gray-800 flex items-end space-x-2 pb-safe sticky bottom-0 z-20">
                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                            <button onClick={() => fileInputRef.current.click()} className="p-3 text-gray-400 hover:text-blue-400 rounded-full hover:bg-gray-800 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                </svg>
                            </button>
                            <div className="flex-1 bg-gray-800 rounded-2xl flex items-center px-4 py-2 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
                                <input
                                    type="text"
                                    className="flex-1 bg-transparent text-white border-none focus:ring-0 placeholder-gray-500 py-1 max-h-32 overflow-y-auto"
                                    placeholder="Message..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                />
                            </div>
                            <button
                                onClick={sendMessage}
                                disabled={!input.trim()}
                                className={`p-3 rounded-full transition-all duration-200 transform hover:scale-105 active:scale-95
                                    ${input.trim() ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
