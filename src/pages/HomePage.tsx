import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  ShieldCheck, 
  Activity, 
  History, 
  BrainCircuit,
  User,
  Menu,
  Plus,
  Save,
  ArrowUpRight,
  Info,
  ExternalLink,
  Trash2,
  Sparkles,
  Search
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  // --- State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(chatService.getSessionId());
  const scrollRef = useRef<HTMLDivElement>(null);
  // --- Initial Load ---
  useEffect(() => {
    loadSessions();
    loadMessages();
  }, []);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);
  // --- API Handlers ---
  const loadSessions = async () => {
    const res = await chatService.listSessions();
    if (res.success && res.data) {
      setSessions(res.data);
    }
  };
  const loadMessages = async () => {
    const res = await chatService.getMessages();
    if (res.success && res.data) {
      setMessages(res.data.messages);
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
    // Optimistic local update (though worker handles state, we want instant UI)
    const tempId = crypto.randomUUID();
    const newUserMsg: Message = {
      id: tempId,
      role: 'user',
      content: userMsg,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newUserMsg]);
    const response = await chatService.sendMessage(
      userMsg,
      MODELS[0].id,
      (chunk) => {
        setStreamingContent(prev => prev + chunk);
      }
    );
    if (response.success) {
      await loadMessages();
      await loadSessions();
    } else {
      toast.error('Connection failed. Please try again.');
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
      toast.success('New health conversation started');
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
  const handleMockAuth = () => {
    setIsAuthenticated(true);
    setShowAuthModal(false);
    toast.success('Identity Verified', {
      description: 'Your health records are now securely synchronized.'
    });
  };
  // --- Render Helpers ---
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col font-sans transition-colors duration-300">
      <Toaster richColors position="top-center" />
      {/* Navigation */}
      <nav className="sticky top-0 z-50 w-full border-b bg-white/70 dark:bg-[#0F172A]/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <Activity className="h-6 w-6 text-emerald-600" />
              </div>
              <span className="text-xl font-bold tracking-tight text-foreground">Veridia</span>
            </div>
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 hidden sm:flex items-center gap-1 py-1">
                  <ShieldCheck className="h-3 w-3" /> Secure Connection
                </Badge>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setShowAuthModal(true)} className="text-muted-foreground">
                  Verify Identity
                </Button>
              )}
              <ThemeToggle className="relative static top-0 right-0" />
              <Avatar className="h-8 w-8 border border-input">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </nav>
      {/* Main Layout */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 py-8">
        {/* Left Sidebar: Memory & History */}
        <aside className="hidden lg:flex lg:col-span-3 flex-col gap-6 h-[calc(100vh-160px)] sticky top-24">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <History className="h-4 w-4 text-emerald-600" /> Health Memory
              </h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={createNewSession}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search insights..." className="pl-8 bg-white dark:bg-slate-900 border-none shadow-sm h-9" />
            </div>
            <ScrollArea className="h-[50vh] pr-4">
              <div className="space-y-2">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => switchSession(s.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-xl transition-all border text-sm group relative",
                      activeSessionId === s.id 
                        ? "bg-white dark:bg-slate-800 border-emerald-200 shadow-sm ring-1 ring-emerald-500/10" 
                        : "bg-transparent border-transparent hover:bg-white/50 dark:hover:bg-slate-800/50 hover:border-slate-200"
                    )}
                  >
                    <p className="font-medium truncate pr-4 text-foreground">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(s.lastActive).toLocaleDateString()}
                    </p>
                    {activeSessionId === s.id && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                  </button>
                ))}
                {sessions.length === 0 && (
                  <div className="text-center py-10 opacity-50 space-y-2">
                    <BrainCircuit className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-xs">No health notes saved yet.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          <Card className="mt-auto p-4 bg-emerald-600 text-white border-none shadow-lg shadow-emerald-500/20 overflow-hidden relative">
            <div className="relative z-10">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Health Guidance
              </h4>
              <p className="text-[11px] mt-1 opacity-90 leading-relaxed">
                Veridia uses AI to provide medical guidance. Please consult a professional for critical needs.
              </p>
            </div>
            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-400/20 rounded-full blur-2xl" />
          </Card>
        </aside>
        {/* Center: Conversation Pane */}
        <main className="col-span-1 lg:col-span-9 flex flex-col gap-4 h-[calc(100vh-160px)]">
          {/* Chat Window */}
          <Card className="flex-1 border-none shadow-soft glass dark:glass-dark overflow-hidden flex flex-col rounded-3xl">
            <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
              <AnimatePresence initial={false}>
                {messages.length === 0 && !isProcessing && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-full flex flex-col items-center justify-center text-center space-y-6 px-4"
                  >
                    <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center animate-pulse">
                      <BrainCircuit className="h-10 w-10 text-emerald-600" />
                    </div>
                    <div className="max-w-md space-y-2">
                      <h2 className="text-2xl font-bold text-foreground">How can I help you today?</h2>
                      <p className="text-muted-foreground text-sm">
                        Ask Veridia about symptoms, nutrition, medication schedules, or exercise plans.
                      </p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 max-w-sm">
                      <div className="flex items-start gap-3 text-left">
                        <Info className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                          Veridia is analyzing your recent session history to provide context-aware wellness suggestions.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {['Analyze symptom', 'Diet plan', 'Medication info'].map(hint => (
                        <Button 
                          key={hint} 
                          variant="outline" 
                          size="sm" 
                          className="rounded-full bg-white/50 dark:bg-slate-900/50"
                          onClick={() => setInput(hint)}
                        >
                          {hint}
                        </Button>
                      ))}
                    </div>
                  </motion.div>
                )}
                {messages.map((msg, i) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={cn(
                      "flex w-full",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div className="flex flex-col gap-2 max-w-[85%] md:max-w-[70%]">
                      {/* Tool Call Visualization */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-1">
                          {msg.toolCalls.map((tc) => (
                            <Badge 
                              key={tc.id} 
                              variant="secondary" 
                              className="bg-slate-100 dark:bg-slate-800 text-[10px] font-mono py-0.5 flex items-center gap-1.5 border-none"
                            >
                              {renderToolCall(tc)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    <div className={cn(
                      "max-w-[85%] md:max-w-[70%] rounded-2xl p-4 text-sm shadow-sm",
                      msg.role === 'user' 
                        ? "bg-emerald-600 text-white rounded-tr-none" 
                        : "bg-white dark:bg-slate-800 border dark:border-slate-700 text-foreground rounded-tl-none"
                    )}>
                      {msg.content}
                      <div className="flex items-center justify-between mt-2">
                        <div className={cn(
                        "text-[10px] opacity-50",
                        msg.role === 'user' ? "text-white/80" : "text-muted-foreground"
                      )}>
                        {formatTime(msg.timestamp)}
                        </div>
                        {msg.role === 'assistant' && (
                          <button onClick={() => saveToMemory(msg.content)} className="text-muted-foreground hover:text-emerald-500 transition-colors">
                            <Save className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    </div>
                  </motion.div>
                ))}
                {streamingContent && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start w-full"
                  >
                    <div className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-tl-none p-4 text-sm bg-white dark:bg-slate-800 border dark:border-slate-700 text-foreground shadow-sm">
                      {streamingContent}
                      <span className="inline-block w-1 h-4 ml-1 bg-emerald-500 animate-pulse align-middle" />
                    </div>
                  </motion.div>
                )}
                <div ref={scrollRef} />
              </AnimatePresence>
            </div>
            {/* Input Area */}
            <div className="p-4 bg-white/50 dark:bg-slate-900/50 border-t backdrop-blur-md">
              <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Veridia anything..."
                  className="flex-1 h-12 rounded-2xl bg-white dark:bg-slate-800 border-none shadow-sm px-6 pr-12 focus-visible:ring-emerald-500/30"
                  disabled={isProcessing}
                />
                <Button 
                  type="submit" 
                  disabled={!input.trim() || isProcessing}
                  size="icon"
                  className="h-12 w-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </form>
              <div className="text-[10px] text-center text-muted-foreground mt-3 uppercase tracking-widest font-medium">
                Note: Limited AI requests per time period may apply.
              </div>
            </div>
          </Card>
        </main>
      </div>
      {/* Auth Modal */}
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader className="items-center text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <DialogTitle className="text-xl">Health Verification</DialogTitle>
            <DialogDescription>
              To access your personalized medical history and insights, please verify your identity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase ml-1">Patient Identifier</label>
              <Input placeholder="VX-990-221" className="bg-slate-50 dark:bg-slate-900 border-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase ml-1">Access Token</label>
              <Input type="password" placeholder="••••••••" className="bg-slate-50 dark:bg-slate-900 border-none" />
            </div>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 rounded-xl" onClick={handleMockAuth}>
              Confirm Identity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}