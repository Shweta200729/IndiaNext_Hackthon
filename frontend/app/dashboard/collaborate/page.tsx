"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users2, CheckCircle2, XCircle, Search, UserPlus, Zap, Clock, BoxIcon } from "lucide-react";
import {
    fetchCollabUsers,
    fetchMyCollabSessions,
    sendCollabRequest,
    respondToCollabRequest,
    fetchCollabMessages,
    sendCollabMessage,
    CollabUser,
    CollabSession,
    ChatMessage
} from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";

export default function CollaboratePage() {
    // Read the logged-in user dynamically from localStorage instead of hardcoding it
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (stored) {
            try {
                const userObj = JSON.parse(stored);
                if (userObj && userObj.id) {
                    setCurrentUserId(userObj.id);
                }
            } catch (e) {
                console.error("Failed to parse user session", e);
            }
        }
    }, []);

    const [allUsers, setAllUsers] = useState<CollabUser[]>([]);
    const [sessions, setSessions] = useState<CollabSession[]>([]);
    const [search, setSearch] = useState("");

    // Chat State
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const loadData = useCallback(async () => {
        if (!currentUserId) return;

        const [u, s] = await Promise.all([
            fetchCollabUsers(),
            fetchMyCollabSessions(currentUserId),
        ]);

        setAllUsers(u.filter(user => user.id !== currentUserId));
        setSessions(s);
    }, [currentUserId]);

    useEffect(() => {
        loadData();

        // Setup real-time listener for incoming requests / status changes
        const sessionChannel = supabase.channel('collab-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'collab_sessions' },
                () => {
                    loadData(); // refresh when any session changes
                }
            )
            .subscribe();

        // Listen for new chat messages
        const chatChannel = supabase.channel('collab-messages')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'collab_messages' },
                (payload) => {
                    const newMsg = payload.new as ChatMessage;
                    if (selectedSessionId && newMsg.session_id === selectedSessionId) {
                        setChatMessages(prev => [...prev, newMsg]);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(sessionChannel);
            supabase.removeChannel(chatChannel);
        };
    }, [loadData, selectedSessionId]);

    // Fetch messages when a session is selected
    useEffect(() => {
        if (selectedSessionId && currentUserId) {
            fetchCollabMessages(currentUserId, selectedSessionId).then(msgs => {
                setChatMessages(msgs);
            });
        }
    }, [selectedSessionId, currentUserId]);

    // Scroll chat to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);


    const handleRequest = async (toUserId: number) => {
        if (!currentUserId) return;
        await sendCollabRequest(currentUserId, toUserId, "Let's train together!");
        await loadData();
    };

    const handleRespond = async (sessionId: string, action: "accept" | "reject" | "cancel") => {
        if (!currentUserId) return;
        await respondToCollabRequest(currentUserId, sessionId, action);
        if (action === "cancel" && selectedSessionId === sessionId) {
            setSelectedSessionId(null);
        }
        await loadData();
    };

    const handleSendMessage = async () => {
        if (!currentUserId || !selectedSessionId || !newMessage.trim()) return;

        const content = newMessage;
        setNewMessage(""); // clear input

        const sentMsg = await sendCollabMessage(selectedSessionId, currentUserId, content);
        if (sentMsg) {
            setChatMessages(prev => {
                // Prevent duplicate if realtime already added it
                if (prev.some(m => m.id === sentMsg.id)) return prev;
                return [...prev, sentMsg];
            });
        }
    };

    // Derived state
    const pendingInbox = sessions.filter(s => s.status === "pending" && s.recipient_id === currentUserId);
    const pendingSent = sessions.filter(s => s.status === "pending" && s.requester_id === currentUserId);
    const activeSessions = sessions.filter(s => s.status === "active" || s.status === "completed");

    const filteredUsers = allUsers.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex flex-col gap-8 pb-10 w-full max-w-7xl">
            <div className="flex flex-col gap-2 relative z-10">
                <h2 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                    <Users2 className="w-7 h-7 text-indigo-600" />
                    Collaboration Hub
                </h2>
                <p className="text-slate-500 text-base max-w-2xl mt-1">
                    Build alliances, invite leading researchers, and train federated models directly across clients.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT COL: Inbox & Active */}
                <div className="lg:col-span-2 flex flex-col gap-6">

                    {/* INBOX */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                            <CardTitle className="text-lg font-bold flex items-center justify-between">
                                <span className="flex items-center gap-2 text-slate-800">
                                    <Clock className="w-5 h-5 text-amber-500" />
                                    Pending Requests
                                </span>
                                {pendingInbox.length > 0 && (
                                    <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
                                        {pendingInbox.length} NEW
                                    </span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3 pt-5">
                            {pendingInbox.length === 0 ? (
                                <div className="text-center py-6">
                                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-100">
                                        <CheckCircle2 className="w-6 h-6 text-slate-300" />
                                    </div>
                                    <p className="text-sm text-slate-500">No incoming requests to review.</p>
                                </div>
                            ) : (
                                pendingInbox.map(s => (
                                    <div key={s.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold">
                                                {s.partner_name?.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 text-sm leading-tight">{s.partner_name}</p>
                                                <p className="text-[13px] text-slate-500 mt-0.5">"{s.message || "Requesting collaboration"}"</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleRespond(s.id, "accept")}
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                            >
                                                Accept
                                            </button>
                                            <button
                                                onClick={() => handleRespond(s.id, "reject")}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <XCircle className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* ACTIVE SESSIONS */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-800">
                                <Zap className="w-5 h-5 text-indigo-500" />
                                Active Collaborations
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 pt-5">
                            {activeSessions.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                                        <Users2 className="w-6 h-6 text-slate-300" />
                                    </div>
                                    <p className="text-sm font-semibold text-slate-600">No active alliances.</p>
                                    <p className="text-xs text-slate-400 mt-1">Discover network on the right to invite peers.</p>
                                </div>
                            ) : (
                                activeSessions.map(s => (
                                    <div key={s.id} className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors group/session flex flex-col gap-4">

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                                                    {s.partner_name?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-[15px]">{s.partner_name}</h4>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                        <p className="text-xs font-semibold text-emerald-600 uppercase">{s.status}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRespond(s.id, "cancel")}
                                                className="text-xs font-semibold text-slate-400 hover:text-red-600 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100 hover:bg-red-50 opacity-0 group-hover/session:opacity-100"
                                            >
                                                Leave
                                            </button>
                                        </div>

                                        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-4">
                                            <div className="flex justify-between items-center pb-3 border-b border-slate-200/60">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Session ID</span>
                                                    <div className="text-sm font-semibold text-slate-700 font-mono flex items-center gap-1.5">
                                                        <BoxIcon className="w-3.5 h-3.5 text-slate-400" />
                                                        {s.id.split('-')[0]}
                                                    </div>
                                                </div>

                                                {s.shared_version_id && (
                                                    <div className="text-xs font-semibold bg-green-50 text-green-700 px-2.5 py-1 rounded-md border border-green-200">
                                                        Model v{s.shared_version_id} Ready
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setSelectedSessionId(selectedSessionId === s.id ? null : s.id)}
                                                    className={`flex-1 py-2 font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 ${selectedSessionId === s.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                                >
                                                    <BoxIcon className="w-4 h-4 opacity-80" />
                                                    {selectedSessionId === s.id ? 'Close Chat' : 'Open Chat'}
                                                </button>
                                                <button className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2">
                                                    <Zap className="w-4 h-4 opacity-80" />
                                                    Submit Weights
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* CHAT WINDOW (Only visible if a session is selected) */}
                    {selectedSessionId && (
                        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden flex flex-col mt-2">
                            <CardHeader className="pb-3 border-b border-slate-100 bg-indigo-50/50">
                                <CardTitle className="text-base font-bold flex items-center gap-2 text-indigo-800">
                                    <Users2 className="w-4 h-4 text-indigo-500" />
                                    Session Chat
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 flex flex-col h-[400px]">
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 custom-scrollbar">
                                    {chatMessages.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                            <p className="text-sm">No messages yet.</p>
                                            <p className="text-xs mt-1">Say hi to your collaborator!</p>
                                        </div>
                                    ) : (
                                        chatMessages.map(msg => {
                                            const isMe = msg.sender_id === currentUserId;
                                            return (
                                                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 shadow-sm rounded-bl-sm'}`}>
                                                        <p>{msg.content}</p>
                                                        <span className={`text-[10px] block mt-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                                <div className="p-3 border-t border-slate-100 bg-white">
                                    <form
                                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                                        className="flex gap-2"
                                    >
                                        <input
                                            type="text"
                                            value={newMessage}
                                            onChange={e => setNewMessage(e.target.value)}
                                            placeholder="Type a message..."
                                            className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!newMessage.trim()}
                                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                                        >
                                            Send
                                        </button>
                                    </form>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                </div>


                {/* RIGHT COL: Discover */}
                <div className="flex flex-col gap-6 h-full">
                    <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[400px] sticky top-6">
                        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-5">
                            <CardTitle className="text-lg font-bold text-slate-800">Discover Network</CardTitle>
                            <CardDescription className="text-sm mt-1">Connect with registered global peers.</CardDescription>

                            <div className="relative mt-5">
                                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search researchers..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                />
                            </div>
                        </CardHeader>

                        <CardContent className="p-0 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="divide-y divide-slate-100">
                                {filteredUsers.map(u => {
                                    const isPendingSent = pendingSent.some(s => s.partner_id === u.id);
                                    const isPendingInbox = pendingInbox.some(s => s.partner_id === u.id);
                                    const isActive = activeSessions.some(s => s.partner_id === u.id);

                                    return (
                                        <div key={u.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm border border-slate-200">
                                                    {u.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col w-[120px] sm:w-auto">
                                                    <p className="font-semibold text-slate-800 text-[13px] truncate">{u.name}</p>
                                                    <p className="text-[12px] text-slate-500 truncate">{u.email}</p>
                                                </div>
                                            </div>

                                            <div className="shrink-0 flex items-center justify-end min-w-[80px]">
                                                {isActive ? (
                                                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Active</span>
                                                ) : isPendingSent ? (
                                                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">Requested</span>
                                                ) : isPendingInbox ? (
                                                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Inbox</span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleRequest(u.id)}
                                                        className="p-1.5 text-slate-400 bg-white border border-slate-200 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Send Invite"
                                                    >
                                                        <UserPlus className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredUsers.length === 0 && (
                                    <div className="p-12 flex flex-col items-center justify-center text-center">
                                        <Search className="w-10 h-10 text-slate-200 mb-3" />
                                        <p className="text-sm font-medium text-slate-500">No researchers found.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    );
}
