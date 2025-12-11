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
        <div className="flex h-screen bg-gray-900 text-white font-sans">
            {/* Sidebar (Hidden on mobile if chat is active) */}
            <div className={`bg-gray-800 border-r border-gray-700 p-4 flex flex-col 
                ${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-1/4`}>
                <h2 className="text-xl font-bold mb-4 text-blue-400">SecureChat</h2>

                <div className="flex space-x-2 mb-4">
                    <button onClick={handleAddContact} className="flex-1 bg-gray-700 hover:bg-gray-600 text-xs py-2 rounded">
                        + Contact
                    </button>
                    <button onClick={handleCreateGroup} className="flex-1 bg-gray-700 hover:bg-gray-600 text-xs py-2 rounded">
                        + Group
                    </button>
                </div>

                <div className="space-y-2 overflow-y-auto flex-1">
                    {chats.map(c => (
                        <div
                            key={getChatKey(c)}
                            onClick={() => setActiveChat(c)}
                            className={`p-3 rounded-lg cursor-pointer transition-all border-l-4 ${activeChat?.id === c.id && activeChat?.type === c.type
                                ? 'bg-gray-700 border-blue-500'
                                : 'bg-transparent border-transparent hover:bg-gray-700'
                                }`}
                        >
                            <h3 className="font-semibold">{c.name}</h3>
                            <p className="text-xs text-gray-400 capitalize">{c.type}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-4 border-t border-gray-700 pt-4">
                    <label className="text-xs text-gray-400 uppercase font-semibold">Secret Key</label>
                    <input type="password" value={secretKey} onChange={e => setSecretKey(e.target.value)} className="w-full bg-gray-900 mt-1 p-1 rounded text-sm" />
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-bold">{user?.username}</span>
                    <button onClick={() => { localStorage.clear(); navigate('/login') }} className="text-red-400 text-xs">Logout</button>
                </div>
            </div>

            {/* Main Chat (Hidden on mobile if no chat active) */}
            <div className={`flex-col bg-gray-900 relative 
                ${!activeChat ? 'hidden md:flex' : 'flex'} flex-1`}>
                {!activeChat ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                        Select a chat to start messaging
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b border-gray-700 bg-gray-800 flex items-center">
                            <button
                                onClick={() => setActiveChat(null)}
                                className="mr-3 md:hidden text-gray-400 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>
                            <h3 className="font-bold text-lg">{activeChat.name}</h3>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto space-y-4">
                            {(messages[getChatKey(activeChat)] || []).map((m, i) => {
                                const fileType = m.isFile ? getFileType(m.fileData?.fileName) : null;
                                return (
                                    <div key={i} className={`flex ${m.isMine ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`p-3 rounded-lg max-w-lg shadow-md ${m.isMine ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                            {!m.isMine && <p className="text-xs text-gray-300 font-bold mb-1">{m.sender}</p>}

                                            {m.isFile ? (
                                                <div className="space-y-2">
                                                    <p className="text-sm italic">{m.fileData?.fileName}</p>

                                                    {m.previewUrl ? (
                                                        <div className="mt-2">
                                                            {fileType === 'image' && <img src={m.previewUrl} alt="Encrypted Media" className="max-w-xs rounded" />}
                                                            {fileType === 'video' && <video src={m.previewUrl} controls className="max-w-xs rounded" />}
                                                            {fileType === 'audio' && <audio src={m.previewUrl} controls className="w-full" />}
                                                        </div>
                                                    ) : (
                                                        <div className="flex space-x-2">
                                                            <button onClick={() => handleDownload(m)} className="mt-2 text-xs bg-gray-900 px-2 py-1 rounded">Download</button>
                                                            {['image', 'video', 'audio'].includes(fileType) && (
                                                                <button onClick={() => handleViewMedia(m, i)} className="mt-2 text-xs bg-green-700 px-2 py-1 rounded">View Media</button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p>{m.text}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>

                        <div className="p-4 bg-gray-800 border-t border-gray-700 flex space-x-2 items-center">
                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                            <button onClick={() => fileInputRef.current.click()} className="p-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">📎</button>
                            <input
                                type="text"
                                className="flex-1 bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder={`Message ${activeChat.name}...`}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                            />
                            <button onClick={sendMessage} className="bg-blue-600 px-6 py-2 rounded-lg font-semibold">Send</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
