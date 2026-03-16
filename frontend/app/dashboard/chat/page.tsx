"use client";
import React, { useEffect, useRef, useState } from "react";
import { Bot, Send, User, RefreshCcw, Database, FlaskConical, Zap } from "lucide-react";

const FL_BASE = "http://localhost:8000/fl";

interface Message {
    role: "user" | "assistant";
    content: string;
    source?: string;
    loading?: boolean;
}

const SUGGESTED = [
    "How does federated learning work?",
    "How do I upload a model?",
    "Show me NLP datasets",
    "What is the contributor leaderboard?",
    "How are experiments tracked?",
    "What is the meta-learning layer?",
];

function MessageBubble({ msg }: { msg: Message }) {
    const isUser = msg.role === "user";
    return (
        <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
            {/* Avatar */}
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm ${isUser ? "bg-indigo-500" : "bg-gradient-to-br from-slate-700 to-slate-900"}`}>
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble */}
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser
                ? "bg-indigo-600 text-white rounded-tr-none"
                : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                }`}>
                {msg.loading ? (
                    <div className="flex gap-1 items-center h-5">
                        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                ) : (
                    <>
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        {msg.source && msg.source !== "rule-based" && (
                            <p className="text-[10px] text-indigo-300 mt-1 font-medium">✦ RAG-powered</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "Hi! I'm the IndiaNext AI Assistant powered by RAG. I can answer questions about federated learning, datasets, experiments, and how to contribute. What would you like to know?",
        },
    ]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const send = async (text: string) => {
        if (!text.trim() || sending) return;
        const userMsg: Message = { role: "user", content: text };
        const placeholder: Message = { role: "assistant", content: "", loading: true };

        setMessages(prev => [...prev, userMsg, placeholder]);
        setInput("");
        setSending(true);

        try {
            const res = await fetch(`${FL_BASE}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text }),
            });

            let reply = "Sorry, I couldn't reach the AI backend right now.";
            let source = "";
            if (res.ok) {
                const json = await res.json();
                reply = json.reply || reply;
                source = json.source || "";
            }

            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: reply, source };
                return updated;
            });
        } catch (e) {
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                    role: "assistant",
                    content: "Network error — make sure the backend is running on port 8000.",
                };
                return updated;
            });
        } finally {
            setSending(false);
            inputRef.current?.focus();
        }
    };

    const clearChat = () => {
        setMessages([{
            role: "assistant",
            content: "Chat cleared! Ask me anything about the IndiaNext FL platform.",
        }]);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] gap-0">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-md">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-900">AI Platform Assistant</h2>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <Zap className="w-3 h-3 text-yellow-400" />
                            RAG-powered · ChromaDB + Sentence Transformers
                        </p>
                    </div>
                </div>
                <button onClick={clearChat} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-all">
                    <RefreshCcw className="w-3.5 h-3.5" /> Clear
                </button>
            </div>

            {/* Suggested questions */}
            {messages.length <= 1 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {SUGGESTED.map((q, i) => (
                        <button
                            key={i}
                            onClick={() => send(q)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-slate-600 text-xs font-medium transition-all"
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
                {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} />
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Quick links */}
            <div className="flex gap-2 py-3 border-t border-slate-100 mt-2">
                <button onClick={() => send("Show me computer vision datasets")} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100">
                    <Database className="w-3.5 h-3.5" /> Datasets
                </button>
                <button onClick={() => send("What experiments have been run?")} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100">
                    <FlaskConical className="w-3.5 h-3.5" /> Experiments
                </button>
                <button onClick={() => send("How do I become a top contributor?")} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100">
                    <Bot className="w-3.5 h-3.5" /> Tips
                </button>
            </div>

            {/* Input */}
            <div className="flex gap-3 pt-2">
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Ask me about the platform, federated learning, or datasets..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
                    disabled={sending}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm disabled:opacity-60"
                />
                <button
                    onClick={() => send(input)}
                    disabled={!input.trim() || sending}
                    className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all disabled:opacity-40 flex items-center gap-2 shadow-sm"
                >
                    <Send className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
