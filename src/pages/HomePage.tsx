import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  ShieldCheck,
  Activity,
  History,
  BrainCircuit,
  User,
  Plus,
  Save,
  Info,
  Sparkles,
  Search,
  Loader2
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Toaster, toast } from 'sonner';
import { chatService, MODELS, formatTime, renderToolCall } from '@/lib/chat';
import type { Message, SessionInfo } from '../../worker/types';
import { cn } from '@/lib/utils';
export function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(chatService.getSessionId());
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadSessions();
    loadMessages();
  }, []);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, isProcessing]);
  const loadSessions = async () => {
    const res = await chatService.listSessions();
    if (res.success && res.data) setSessions(res.data);
  };
  const loadMessages = async () => {
    try {
      const res = await chatService.getMessages();
      if (res.success && res.data) {
        setMessages(res.data.messages || []);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      toast.error('Unable to load conversation history');
      setMessages([]);
    }
  };
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    const userMsg = input.trim();
    setInput('');
    setIsProcessing(true);
    setStreamingContent('');
    const newUserMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMsg,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newUserMsg]);
    const response = await chatService.sendMessage(userMsg, MODELS[0].id, (chunk) => {
      setStreamingContent(prev => prev + chunk);
    });
    if (response.success) {
      await loadMessages();
      await loadSessions();
    } else {
      toast.error('Clinical connection lost. Please try again.');
    }
    setStreamingContent('');
    setIsProcessing(false);
  };
  const createNewSession = async () => {
    const res = await chatService.createSession();
    if (res.success && res.data) {
      chatService.switchSession(res.data.sessionId);
      setActiveSessionId(res.data.sessionId);
      setMessages([]);
      loadSessions();
      toast.success('New clinical session initialized');
    }
  };
  const saveToMemory = async (content: string) => {
    const res = await chatService.saveToMemory(content);
    if (res.success) {
      toast.success('Saved to Health Memory');
      loadSessions();
    }
  };
  const switchSession = (id: string) => {
    chatService.switchSession(id);
    setActiveSessionId(id);
    loadMessages();
  };
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F172A] flex flex-col font-sans transition-colors duration-300">
      <Toaster richColors position="top-center" />
      <nav className="sticky top-0 z-50 w-full border-b bg-white/80 dark:bg-[#0F172A]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-emerald-600" />
            <span className="text-xl font-bold tracking-tight text-foreground">Veridia</span>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 hidden sm:flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Secure
              </Badge>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowAuthModal(true)}>Verify Identity</Button>
            )}
            <ThemeToggle className="relative static" />
            <Avatar className="h-8 w-8"><AvatarFallback><User className="h-4 w-4" /></AvatarFallback></Avatar>
          </div>
        </div>
      </nav>
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 py-8 md:py-10">
        <aside className="hidden lg:flex lg:col-span-3 flex-col gap-6 sticky top-24 h-[calc(100vh-160px)]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2"><History className="h-4 w-4" /> History</h3>
              <Button variant="ghost" size="icon" onClick={createNewSession}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search records..." className="pl-8 bg-white dark:bg-slate-900 border-none shadow-sm" />
            </div>
            <ScrollArea className="h-[50vh] pr-4">
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => switchSession(s.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all border text-sm group relative",
                      activeSessionId === s.id ? "bg-white dark:bg-slate-800 border-emerald-200 shadow-sm" : "border-transparent hover:bg-slate-200/50"
                    )}
                  >
                    <p className="font-medium truncate text-foreground">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(s.lastActive).toLocaleDateString()}</p>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <Card className="mt-auto p-4 bg-emerald-600 text-white border-none shadow-lg">
            <h4 className="text-sm font-bold flex items-center gap-2"><Sparkles className="h-4 w-4" /> Insights</h4>
            <p className="text-[10px] mt-1 opacity-90">Veridia is educational, not diagnostic. Always consult a professional.</p>
          </Card>
        </aside>
        <main className="col-span-1 lg:col-span-9 flex flex-col gap-4 h-[calc(100vh-160px)]">
          <Card className="flex-1 border-none shadow-soft glass dark:glass-dark overflow-hidden flex flex-col rounded-3xl relative">
            <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
              <AnimatePresence>
                {messages.length === 0 && !isProcessing && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center text-center space-y-4">
                    <BrainCircuit className="h-12 w-12 text-emerald-600 opacity-20" />
                    <h2 className="text-2xl font-bold">Veridia Companion</h2>
                    <p className="text-muted-foreground max-w-sm">Ask about symptoms, wellness, or clinical data.</p>
                  </motion.div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className="flex flex-col gap-2 max-w-[85%] md:max-w-[70%]">
                      {msg.toolCalls?.map((tc) => (
                        <Badge key={tc.id} variant="secondary" className="w-fit text-[10px] py-0.5">{renderToolCall(tc)}</Badge>
                      ))}
                      <div className={cn("rounded-2xl p-4 text-sm shadow-sm", msg.role === 'user' ? "bg-emerald-600 text-white rounded-tr-none" : "bg-white dark:bg-slate-800 border text-foreground rounded-tl-none")}>
                        {msg.content}
                        <div className="flex items-center justify-between mt-2 opacity-50 text-[10px]">
                          {formatTime(msg.timestamp)}
                          {msg.role === 'assistant' && (
                            <button onClick={() => saveToMemory(msg.content)} className="hover:text-emerald-500"><Save className="h-3 w-3" /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {streamingContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-tl-none p-4 text-sm bg-white dark:bg-slate-800 border text-foreground shadow-sm">
                      {streamingContent}
                      <span className="inline-block w-1 h-4 ml-1 bg-emerald-500 animate-pulse align-middle" />
                    </div>
                  </div>
                )}
                {isProcessing && !streamingContent && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white dark:bg-slate-800 border rounded-2xl rounded-tl-none p-4 flex items-center gap-3 text-sm text-muted-foreground shadow-sm">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                      <span>Veridia is analyzing...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={scrollRef} />
            </div>
            <div className="p-4 bg-white/50 dark:bg-slate-900/50 border-t backdrop-blur-md">
              <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex gap-2">
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Veridia anything..." className="h-12 rounded-2xl bg-white dark:bg-slate-800 border-none px-6" disabled={isProcessing} />
                <Button type="submit" disabled={!input.trim() || isProcessing} size="icon" className="h-12 w-12 rounded-2xl bg-emerald-600"><Send className="h-5 w-5" /></Button>
              </form>
              <div className="text-[10px] text-center text-muted-foreground mt-3 uppercase tracking-tighter">Note: AI request limits may apply.</div>
            </div>
          </Card>
        </main>
      </div>
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="items-center"><ShieldCheck className="h-10 w-10 text-emerald-600 mb-2" /><DialogTitle>Clinical Verification</DialogTitle><DialogDescription>Securely sync your health records.</DialogDescription></DialogHeader>
          <div className="py-4 space-y-4"><Input placeholder="Patient ID" /><Input type="password" placeholder="Access Token" /></div>
          <DialogFooter><Button className="w-full bg-emerald-600" onClick={() => { setIsAuthenticated(true); setShowAuthModal(false); }}>Verify Identity</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}