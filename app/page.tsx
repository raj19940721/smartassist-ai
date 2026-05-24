"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import jsPDF from "jspdf";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const { user } = useUser();
  const [message, setMessage] = useState("");
  type Message = {
    role: string;
    content: string;
  };

  type ChatSession = {
    id: string;
    title: string;
    messages: Message[];
  };

  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);

  const [editedTitle, setEditedTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeSession = sessions.find(
    (session) => session.id === activeSessionId,
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [activeSession?.messages]);

  useEffect(() => {
    const fetchSessions = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", {
          ascending: false,
        });

      if (error) {
        console.error("Supabase Save Error:", JSON.stringify(error, null, 2));
        return;
      }

      if (data && data.length > 0) {
        const formattedSessions = data.map((item) => ({
          id: item.id,
          title: item.title,
          messages: item.messages || [],
        }));

        const uniqueSessions = Array.from(
          new Map(formattedSessions.map((item) => [item.id, item])).values(),
        );

        setSessions(uniqueSessions);

        setActiveSessionId(formattedSessions[0].id);
      }
    };

    fetchSessions();
  }, [user]);

  useEffect(() => {
    const saveSessions = async () => {
      if (!user) return;

      if (sessions.length === 0) return;

      for (const session of sessions) {
        const { error } = await supabase.from("chat_sessions").upsert({
          id: session.id,
          user_id: user.id,
          title: session.title,
          messages: session.messages,
          updated_at: new Date(),
        });

        if (error) {
          console.error(error);
        }
      }
    };

    saveSessions();
  }, [sessions, user]);

  const sendMessage = async () => {
    if (!message.trim()) return;

    try {
      setLoading(true);

      const userMessage = {
        role: "user",
        content: message,
      };

      const chatTitle =
        message.length > 30 ? message.slice(0, 30) + "..." : message;

      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId
            ? {
                ...session,
                title:
                  session.messages.length === 0 ? chatTitle : session.title,
                messages: [...session.messages, userMessage],
              }
            : session,
        ),
      );

      setMessage("");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
        }),
      });

      const data = await res.json();

      const aiMessage = {
        role: "assistant",
        content: data.reply,
      };

      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSessionId
            ? {
                ...session,
                messages: [...session.messages, aiMessage],
              }
            : session,
        ),
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const exportChat = (type: "txt" | "md") => {
    if (!activeSession) return;

    const content = activeSession.messages
      .map((msg) => `${msg.role.toUpperCase()}:\n${msg.content}`)
      .join("\n\n");

    const blob = new Blob([content], {
      type: type === "txt" ? "text/plain" : "text/markdown",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = `${activeSession.title}.${type}`;

    a.click();

    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!activeSession) return;

    const doc = new jsPDF();

    const content = activeSession.messages
      .map((msg) => `${msg.role.toUpperCase()}:\n${msg.content}`)
      .join("\n\n");

    doc.text(content, 10, 10);

    doc.save(`${activeSession.title}.pdf`);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col md:flex-row">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div
        className={`fixed md:static top-0 left-0 h-full z-50 w-72 bg-zinc-950 border-r border-zinc-800 p-4
        transform transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <button
          className="w-full bg-white text-black py-3 rounded-xl mb-4"
          onClick={async () => {
            const newSession = {
              id: uuidv4(),
              title: "New Chat",
              messages: [],
            };

            setSessions((prev) => [newSession, ...prev]);

            setActiveSessionId(newSession.id);
          }}
        >
          + New Chat
        </button>

        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`p-3 rounded-lg ${
                activeSessionId === session.id ? "bg-zinc-800" : "bg-zinc-900"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                {editingSessionId === session.id ? (
                  <input
                    autoFocus
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onBlur={() => {
                      setSessions((prev) =>
                        prev.map((s) =>
                          s.id === session.id
                            ? {
                                ...s,
                                title: editedTitle || "New Chat",
                              }
                            : s,
                        ),
                      );

                      setEditingSessionId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSessions((prev) =>
                          prev.map((s) =>
                            s.id === session.id
                              ? {
                                  ...s,
                                  title: editedTitle || "New Chat",
                                }
                              : s,
                          ),
                        );

                        setEditingSessionId(null);
                      }
                    }}
                    className="bg-zinc-700 text-white px-2 py-1 rounded w-full outline-none"
                  />
                ) : (
                  <div
                    className="flex-1 truncate cursor-pointer"
                    onClick={() => {
                      setActiveSessionId(session.id);
                      setSidebarOpen(false);
                    }}
                  >
                    {session.title}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    className="text-gray-400"
                    onClick={async () => {
                      setEditingSessionId(session.id);
                      setEditedTitle(session.title);
                    }}
                  >
                    ✎
                  </button>

                  <button
                    className="text-red-400"
                    onClick={async () => {
                      const filteredSessions = sessions.filter(
                        (s) => s.id !== session.id,
                      );

                      if (filteredSessions.length === 0) {
                        const newSession = {
                          id: uuidv4(),
                          title: "New Chat",
                          messages: [],
                        };

                        setSessions([newSession]);

                        setActiveSessionId(newSession.id);
                      } else {
                        await supabase
                          .from("chat_sessions")
                          .delete()
                          .eq("id", session.id);
                        setSessions(filteredSessions);

                        if (activeSessionId === session.id) {
                          setActiveSessionId(filteredSessions[0].id);
                        }
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 p-4 md:p-6 overflow-hidden">
        <div className="max-w-3xl mx-auto">
          <button
            className="md:hidden mb-4 bg-zinc-800 px-4 py-2 rounded-lg"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰ Menu
          </button>
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                SmartAssist AI
              </h1>

              <p className="text-gray-400">Your personal AI assistant</p>
            </div>

            <div className="flex items-center gap-3">
              <SignInButton />

              <UserButton />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <button
              className="bg-zinc-800 px-4 py-2 rounded-lg"
              onClick={() => exportChat("txt")}
            >
              Export TXT
            </button>

            <button
              className="bg-zinc-800 px-4 py-2 rounded-lg"
              onClick={() => exportChat("md")}
            >
              Export MD
            </button>

            <button
              className="bg-zinc-800 px-4 py-2 rounded-lg"
              onClick={exportPDF}
            >
              Export PDF
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <input
              className="flex-1 p-4 rounded-xl bg-zinc-900 border border-zinc-700 outline-none"
              placeholder="Ask something..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  sendMessage();
                }
              }}
            />

            <button
              disabled={loading}
              className="bg-white text-black px-6 py-4 rounded-xl font-semibold disabled:opacity-50 w-full md:w-auto"
              onClick={sendMessage}
            >
              Send
            </button>
            <button
              className="bg-red-500 text-white px-6 py-4 rounded-xl font-semibold w-full md:w-auto"
              onClick={() => {
                setSessions((prev) =>
                  prev.map((session) =>
                    session.id === activeSessionId
                      ? {
                          ...session,
                          messages: [],
                        }
                      : session,
                  ),
                );
              }}
            >
              Clear
            </button>
          </div>

          <div className="mt-8 space-y-4">
            {activeSession?.messages.map((msg, index) => (
              <div
                key={index}
                className={`p-4 rounded-2xl w-fit max-w-[95%] md:max-w-full whitespace-pre-wrap overflow-x-auto ${
                  msg.role === "user"
                    ? "bg-blue-600 ml-auto text-white"
                    : "bg-zinc-900 text-gray-100"
                }`}
              >
                <ReactMarkdown
                  components={{
                    code({ className, children }) {
                      const match = /language-(\w+)/.exec(className || "");

                      return match ? (
                        <SyntaxHighlighter
                          style={oneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            overflowX: "auto",
                            borderRadius: "12px",
                            padding: "16px",
                          }}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className="bg-zinc-800 px-1 rounded">
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
                {msg.role === "assistant" && (
                  <button
                    className="text-sm mt-2 text-gray-400"
                    onClick={() => navigator.clipboard.writeText(msg.content)}
                  >
                    Copy
                  </button>
                )}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {loading && (
            <div className="mt-4 flex gap-1">
              <span className="animate-bounce">•</span>
              <span className="animate-bounce delay-100">•</span>
              <span className="animate-bounce delay-200">•</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
