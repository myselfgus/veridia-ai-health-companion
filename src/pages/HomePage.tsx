import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  ChevronRight,
  History,
  LockKeyhole,
  LogOut,
  Menu,
  Mic,
  MicOff,
  PanelLeft,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  User,
  Volume2,
  X,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { chatService, formatTime, MODELS, renderToolCall } from '@/lib/chat';
import { cn } from '@/lib/utils';
import type { Message, SessionInfo } from '../../worker/types';

const AUTH_STORAGE_KEY = 'veridia_authenticated';

const DEMO_SESSIONS: SessionInfo[] = [
  {
    id: 'demo-prevention-plan',
    title: 'Preventive check-in and sleep routine',
    createdAt: Date.now() - 1000 * 60 * 60 * 30,
    lastActive: Date.now() - 1000 * 60 * 28,
  },
  {
    id: 'demo-blood-pressure',
    title: 'Blood pressure questions for appointment',
    createdAt: Date.now() - 1000 * 60 * 60 * 72,
    lastActive: Date.now() - 1000 * 60 * 60 * 7,
  },
  {
    id: 'demo-labs',
    title: 'Lab result explanation checklist',
    createdAt: Date.now() - 1000 * 60 * 60 * 110,
    lastActive: Date.now() - 1000 * 60 * 60 * 24,
  },
];

const QUICK_PROMPTS = [
  'Help me prepare questions for a primary care appointment.',
  'Summarize what I should track before discussing fatigue with a clinician.',
  'Create a gentle plan for sleep, hydration, and movement this week.',
];

const HEALTH_SIGNALS = [
  { label: 'Context', value: 'educational guidance' },
  { label: 'Privacy', value: 'local session first' },
  { label: 'Mode', value: MODELS[0].name },
];

const getFallbackResponse = (message: string) =>
  `I can help you organize this safely. For "${message}", start by noting when it began, what changed recently, severity, medications or supplements, and any red flags. If symptoms are severe, sudden, or worsening, contact a qualified clinician or urgent care.`;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function LoginExperience({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('demo@veridia.health');
  const [passcode, setPasscode] = useState('123456');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || passcode.trim().length < 4) {
      toast.error('Use an email and a 4+ digit passcode for the demo login.');
      return;
    }
    onLogin();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.72fr)]">
        <section className="hidden bg-neutral-950 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="px-12 pt-10">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-white text-neutral-950">
                <Activity className="size-5" />
              </div>
              <span className="text-lg font-semibold">Veridia</span>
            </div>
          </div>
          <div className="px-12 pb-14">
            <div className="max-w-2xl">
              <h1 className="text-5xl font-semibold leading-[1.05] tracking-normal">
                A calm workspace for health questions, memory, and next steps.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-neutral-300">
                Veridia keeps the interface quiet so the patient context stays clear: secure entry,
                guided conversation, memory, and clinician-ready summaries.
              </p>
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
              {['Secure demo', 'Memory-ready', 'Mobile-first'].map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <Check className="size-4 text-emerald-300" />
                  <p className="mt-4 text-sm text-neutral-200">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <main className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Activity className="size-5" />
                </div>
                <span className="text-lg font-semibold">Veridia</span>
              </div>
              <ThemeToggle className="relative static" />
            </div>

            <Card className="border-border/80 shadow-sm">
              <CardHeader className="gap-3 p-6 sm:p-8">
                <div className="flex size-11 items-center justify-center rounded-xl border bg-muted">
                  <LockKeyhole className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-semibold tracking-normal">
                    Sign in to Veridia
                  </CardTitle>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Use the demo credentials or your own local values to enter the companion.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0 sm:p-8 sm:pt-0">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Email
                    <Input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      className="h-12 rounded-xl"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    Access passcode
                    <Input
                      value={passcode}
                      onChange={(event) => setPasscode(event.target.value)}
                      type="password"
                      autoComplete="current-password"
                      className="h-12 rounded-xl"
                    />
                  </label>
                  <Button type="submit" className="mt-2 h-12 rounded-xl text-sm">
                    Continue
                    <ArrowRight className="size-4" />
                  </Button>
                </form>
                <Button variant="ghost" className="mt-3 h-11 w-full rounded-xl" onClick={onLogin}>
                  Continue with demo session
                </Button>
                <Alert className="mt-6 rounded-xl">
                  <ShieldCheck className="size-4" />
                  <AlertTitle>Health safety</AlertTitle>
                  <AlertDescription>
                    Veridia is educational and organizational. It does not diagnose, prescribe, or
                    replace professional care.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  onSave,
  onSpeak,
}: {
  msg: Message;
  onSave: (content: string) => void;
  onSpeak: (content: string) => void;
}) {
  const isUser = msg.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-[92%] flex-col gap-2 md:max-w-[74%]', isUser && 'items-end')}>
        {msg.toolCalls?.map((toolCall) => (
          <Badge key={toolCall.id} variant="secondary" className="w-fit rounded-full">
            {renderToolCall(toolCall)}
          </Badge>
        ))}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
            isUser
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md border bg-card text-card-foreground'
          )}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
          <div
            className={cn(
              'mt-3 flex items-center gap-3 text-xs',
              isUser ? 'justify-end text-primary-foreground/70' : 'justify-between text-muted-foreground'
            )}
          >
            <span>{formatTime(msg.timestamp)}</span>
            {!isUser && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full"
                  onClick={() => onSave(msg.content)}
                  aria-label="Save response to memory"
                >
                  <Save className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-full"
                  onClick={() => onSpeak(msg.content)}
                  aria-label="Read response aloud"
                >
                  <Volume2 className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem(AUTH_STORAGE_KEY) === 'true'
  );
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>(DEMO_SESSIONS);
  const [sessionSearch, setSessionSearch] = useState('');
  const [activeSessionId, setActiveSessionId] = useState(chatService.getSessionId());
  const [isListening, setIsListening] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) =>
        session.title.toLowerCase().includes(sessionSearch.trim().toLowerCase())
      ),
    [sessionSearch, sessions]
  );

  const loadSessions = useCallback(async () => {
    const response = await chatService.listSessions();
    if (response.success && response.data && response.data.length > 0) {
      setSessions(response.data);
      return;
    }
    setSessions(DEMO_SESSIONS);
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const response = await chatService.getMessages();
      if (response.success && response.data) {
        setMessages(response.data.messages || []);
        setConnectionError(false);
      } else {
        setConnectionError(true);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      setConnectionError(true);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    loadMessages();
  }, [loadMessages, loadSessions]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, isProcessing]);

  const handleLogin = () => {
    localStorage.setItem(AUTH_STORAGE_KEY, 'true');
    setIsAuthenticated(true);
    toast.success('Welcome to Veridia');
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(false);
    setShowProfileDialog(false);
  };

  const retryConnection = async () => {
    setIsRetrying(true);
    setConnectionError(false);
    await Promise.all([loadMessages(), loadSessions()]);
    setIsRetrying(false);
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) {
      toast.error('Voice output is not supported in this browser.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceInput = () => {
    const speechWindow = window as Window &
      typeof globalThis & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Voice input is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
      toast.success('Voice captured');
    };
    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Voice input failed');
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    toast.info('Listening...');
  };

  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput('');
    setIsProcessing(true);
    setStreamingContent('');

    const newUserMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    setMessages((previous) => [...previous, newUserMessage]);

    const response = await chatService.sendMessage(userMessage, MODELS[0].id, (chunk) => {
      setStreamingContent((previous) => previous + chunk);
    });

    if (response.success) {
      await Promise.all([loadMessages(), loadSessions()]);
    } else {
      const fallbackMessage: Message = {
        id: `assistant-fallback-${Date.now()}`,
        role: 'assistant',
        content: getFallbackResponse(userMessage),
        timestamp: Date.now(),
      };
      setMessages((previous) => [...previous, fallbackMessage]);
      setConnectionError(true);
      toast.warning('Live AI is unavailable, so Veridia showed a local safety fallback.');
    }

    setStreamingContent('');
    setIsProcessing(false);
  };

  const createNewSession = async () => {
    const response = await chatService.createSession();
    if (response.success && response.data) {
      chatService.switchSession(response.data.sessionId);
      setActiveSessionId(response.data.sessionId);
      setMessages([]);
      await loadSessions();
      toast.success('New session ready');
      return;
    }

    const localSession: SessionInfo = {
      id: `local-${Date.now()}`,
      title: 'Local planning session',
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    setSessions((previous) => [localSession, ...previous]);
    setActiveSessionId(localSession.id);
    setMessages([]);
    toast.info('Started a local demo session.');
  };

  const saveToMemory = async (content: string) => {
    const response = await chatService.saveToMemory(content);
    if (response.success) {
      toast.success('Saved to Health Memory');
      await loadSessions();
      return;
    }
    toast.info('Saved as local session context for this demo.');
  };

  const switchSession = (id: string) => {
    if (id.startsWith('demo-') || id.startsWith('local-')) {
      setActiveSessionId(id);
      setMessages([]);
      setMobilePanelOpen(false);
      return;
    }
    chatService.switchSession(id);
    setActiveSessionId(id);
    loadMessages();
    setMobilePanelOpen(false);
  };

  if (!isAuthenticated) {
    return <LoginExperience onLogin={handleLogin} />;
  }

  const sidebar = (
    <aside className="flex h-full flex-col border-r bg-muted/30">
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Activity className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Veridia</p>
            <p className="text-xs text-muted-foreground">AI health companion</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobilePanelOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <div className="px-3">
        <Button className="h-11 w-full justify-start rounded-xl" onClick={createNewSession}>
          <Plus className="size-4" />
          New session
        </Button>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={sessionSearch}
            onChange={(event) => setSessionSearch(event.target.value)}
            placeholder="Search sessions"
            className="h-10 rounded-xl pl-9"
          />
        </div>
      </div>
      <ScrollArea className="mt-4 flex-1 px-3">
        <div className="flex flex-col gap-1 pb-4">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => switchSession(session.id)}
              className={cn(
                'rounded-xl px-3 py-3 text-left text-sm transition-colors',
                activeSessionId === session.id ? 'bg-background shadow-sm' : 'hover:bg-background/70'
              )}
            >
              <p className="truncate font-medium">{session.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(session.lastActive).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <Alert className="rounded-xl bg-background">
          <ShieldCheck className="size-4" />
          <AlertTitle>Not medical advice</AlertTitle>
          <AlertDescription>
            Use Veridia to prepare and organize. Clinicians make care decisions.
          </AlertDescription>
        </Alert>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <div className="grid h-screen grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="hidden lg:block">{sidebar}</div>

        <AnimatePresence>
          {mobilePanelOpen && (
            <motion.div
              className="fixed inset-0 z-50 bg-background lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {sidebar}
            </motion.div>
          )}
        </AnimatePresence>

        <main className="flex min-h-0 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b px-3 sm:px-5">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobilePanelOpen(true)}>
                <Menu className="size-5" />
              </Button>
              <div>
                <p className="text-sm font-semibold">Companion</p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Educational guidance with saved context
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" className="hidden rounded-xl sm:inline-flex">
                <Link to="/memory">
                  <BookOpen className="size-4" />
                  Memory
                </Link>
              </Button>
              <ThemeToggle className="relative static" />
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setShowProfileDialog(true)}
                aria-label="Open profile"
              >
                <Avatar className="size-8">
                  <AvatarFallback>
                    <User className="size-4" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="flex min-h-0 flex-col">
              {connectionError && (
                <div className="border-b bg-muted/40 px-4 py-3">
                  <Alert className="mx-auto max-w-4xl rounded-xl bg-background">
                    <Activity className="size-4" />
                    <AlertTitle>Live connection degraded</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span>Chat remains usable with local safety simulations while the service recovers.</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-fit rounded-xl"
                        onClick={retryConnection}
                        disabled={isRetrying}
                      >
                        {isRetrying ? 'Retrying...' : 'Retry'}
                      </Button>
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              <ScrollArea className="flex-1">
                <div className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:py-8">
                  <AnimatePresence>
                    {messages.length === 0 && !isProcessing && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex min-h-[58vh] flex-col justify-center"
                      >
                        <div className="max-w-2xl">
                          <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted">
                            <BrainCircuit className="size-6" />
                          </div>
                          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
                            What should we organize for your health today?
                          </h1>
                          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                            Ask Veridia to clarify symptoms, prepare appointment questions, or turn
                            scattered notes into a safer next-step plan.
                          </p>
                        </div>
                        <div className="mt-8 grid gap-3 md:grid-cols-3">
                          {QUICK_PROMPTS.map((prompt) => (
                            <button
                              key={prompt}
                              onClick={() => setInput(prompt)}
                              className="group rounded-2xl border bg-card p-4 text-left text-sm leading-6 shadow-sm transition-colors hover:bg-muted/60"
                            >
                              <Sparkles className="mb-5 size-4 text-muted-foreground" />
                              <span>{prompt}</span>
                              <ChevronRight className="mt-4 size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {messages.map((message) => (
                      <MessageBubble key={message.id} msg={message} onSave={saveToMemory} onSpeak={speak} />
                    ))}

                    {streamingContent && (
                      <div className="flex justify-start">
                        <div className="max-w-[92%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm leading-6 shadow-sm md:max-w-[74%]">
                          {streamingContent}
                          <span className="ml-1 inline-block h-4 w-1 translate-y-0.5 animate-pulse bg-primary" />
                        </div>
                      </div>
                    )}

                    {isProcessing && !streamingContent && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex">
                        <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                          <span className="flex gap-1">
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]" />
                          </span>
                          Veridia is thinking
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div ref={scrollRef} />
                </div>
              </ScrollArea>

              <div className="border-t bg-background px-3 py-3 sm:px-5">
                <form onSubmit={handleSend} className="mx-auto flex max-w-4xl items-end gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Message Veridia"
                      className="min-h-12 rounded-2xl border-input bg-muted/40 px-4 pr-24 text-base shadow-none sm:text-sm"
                      disabled={isProcessing}
                    />
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={toggleVoiceInput}
                        className="size-8 rounded-full"
                        disabled={isProcessing}
                        aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                      >
                        {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                      </Button>
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!input.trim() || isProcessing}
                        className="size-8 rounded-full"
                        aria-label="Send message"
                      >
                        <Send className="size-4" />
                      </Button>
                    </div>
                  </div>
                </form>
                <p className="mx-auto mt-2 max-w-4xl text-center text-xs text-muted-foreground">
                  Veridia can make mistakes. Use it to prepare for care, not to replace care.
                </p>
              </div>
            </section>

            <aside className="hidden min-h-0 border-l bg-muted/20 lg:flex lg:flex-col">
              <div className="p-5">
                <h2 className="text-sm font-semibold">Session context</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Keep the current conversation grounded and portable for clinician review.
                </p>
              </div>
              <Separator />
              <div className="flex flex-col gap-4 p-5">
                {HEALTH_SIGNALS.map((signal) => (
                  <div key={signal.label} className="rounded-xl border bg-background p-4">
                    <p className="text-xs text-muted-foreground">{signal.label}</p>
                    <p className="mt-1 text-sm font-medium">{signal.value}</p>
                  </div>
                ))}
                <Card className="shadow-sm">
                  <CardHeader className="p-4">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Stethoscope className="size-4" />
                      Care checklist
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 p-4 pt-0 text-sm text-muted-foreground">
                    <p>Track onset, severity, triggers, medication changes, and red flags.</p>
                    <Button asChild variant="outline" className="justify-between rounded-xl">
                      <Link to="/memory">
                        Open memory
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </aside>
          </div>

          <nav className="grid h-14 grid-cols-3 border-t bg-background text-xs lg:hidden">
            <Button variant="ghost" className="h-full rounded-none" onClick={() => setMobilePanelOpen(true)}>
              <PanelLeft className="size-4" />
              Sessions
            </Button>
            <Button asChild variant="ghost" className="h-full rounded-none">
              <Link to="/memory">
                <History className="size-4" />
                Memory
              </Link>
            </Button>
            <Button variant="ghost" className="h-full rounded-none" onClick={createNewSession}>
              <Plus className="size-4" />
              New
            </Button>
          </nav>
        </main>
      </div>

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Veridia profile</DialogTitle>
            <DialogDescription>Demo account controls for this local companion workspace.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <Avatar className="size-10">
              <AvatarFallback>
                <User className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">Demo Patient</p>
              <p className="text-xs text-muted-foreground">demo@veridia.health</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full rounded-xl" onClick={handleLogout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
