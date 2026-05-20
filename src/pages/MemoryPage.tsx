import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { chatService } from '@/lib/chat';
import type { SessionInfo } from '../../worker/types';

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

const LIBRARY_ITEMS = [
  {
    title: 'Appointment preparation',
    text: 'Turn symptoms, timelines, and medication notes into a concise clinician agenda.',
    icon: ClipboardList,
  },
  {
    title: 'Vitals and lifestyle tracking',
    text: 'Record patterns without turning uncertainty into a diagnosis.',
    icon: HeartPulse,
  },
  {
    title: 'Longitudinal memory',
    text: 'Keep durable questions and summaries available across conversations.',
    icon: BrainCircuit,
  },
];

export function MemoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionInfo[]>(DEMO_SESSIONS);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const response = await chatService.listSessions();
      if (response.success && response.data && response.data.length > 0) {
        setSessions(response.data);
      }
    };

    loadData();
  }, []);

  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) =>
        session.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ),
    [searchQuery, sessions]
  );

  const openSession = (sessionId: string) => {
    if (!sessionId.startsWith('demo-')) {
      chatService.switchSession(sessionId);
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" className="rounded-xl" onClick={() => navigate('/')}>
            <ArrowLeft className="size-4" />
            Companion
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/">
              New chat
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-10">
        <section className="min-w-0">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border bg-muted">
                <BookOpen className="size-6" />
              </div>
              <h1 className="text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
                Health Memory
              </h1>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Review saved sessions, reopen useful context, and keep patient questions ready for
                the next conversation.
              </p>
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search memory"
                className="h-11 rounded-xl pl-10"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-3xl font-semibold">{sessions.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">records available</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-3xl font-semibold">3</p>
                <p className="mt-1 text-sm text-muted-foreground">demo workflows</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <p className="text-3xl font-semibold">0</p>
                <p className="mt-1 text-sm text-muted-foreground">diagnostic claims</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Saved sessions</h2>
            <Badge variant="secondary" className="rounded-full">
              {filteredSessions.length} shown
            </Badge>
          </div>

          <div className="mt-4 grid gap-3">
            {filteredSessions.map((session, index) => (
              <motion.button
                key={session.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                onClick={() => openSession(session.id)}
                className="group rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-full">
                        <CalendarDays className="size-3" />
                        {new Date(session.lastActive).toLocaleDateString()}
                      </Badge>
                      {session.id.startsWith('demo-') && (
                        <Badge variant="secondary" className="rounded-full">
                          Demo
                        </Badge>
                      )}
                    </div>
                    <h3 className="mt-3 truncate text-base font-semibold">{session.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Created {new Date(session.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </motion.button>
            ))}

            {filteredSessions.length === 0 && (
              <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center">
                <Activity className="mx-auto size-10 text-muted-foreground" />
                <p className="mt-4 font-medium">No records match that search.</p>
                <p className="mt-2 text-sm text-muted-foreground">Try a broader term or start a new chat.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          <Alert className="rounded-2xl">
            <ShieldCheck className="size-4" />
            <AlertTitle>Memory boundary</AlertTitle>
            <AlertDescription>
              Saved content is for organization and follow-up. It is not a medical chart or diagnosis.
            </AlertDescription>
          </Alert>

          <Card className="shadow-sm">
            <CardHeader className="p-5">
              <CardTitle className="text-base">Health library</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 p-5 pt-0">
              {LIBRARY_ITEMS.map((item, index) => (
                <React.Fragment key={item.title}>
                  <div className="flex gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <item.icon className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.text}</p>
                    </div>
                  </div>
                  {index < LIBRARY_ITEMS.length - 1 && <Separator />}
                </React.Fragment>
              ))}
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}
