import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, BrainCircuit, Search, BookOpen, Bookmark, Activity, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { chatService } from '@/lib/chat';
import type { SessionInfo } from '../../worker/types';
export function MemoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const loadData = async () => {
      const res = await chatService.listSessions();
      if (res.success && res.data) setSessions(res.data);
    };
    loadData();
  }, []);
  const filteredSessions = sessions.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 lg:py-12">
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="group -ml-3 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back
          </Button>
          <h1 className="text-4xl font-display font-bold tracking-tight">Health Memory</h1>
          <p className="text-muted-foreground">Your persistent clinical insights and educational records.</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search health records..." className="pl-10 h-11 bg-white border-input shadow-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <section className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-emerald-500" /> Clinical Records</h2>
            <Badge variant="secondary" className="font-mono">{filteredSessions.length} Total</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSessions.map((session, i) => (
              <motion.div key={session.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="cursor-pointer hover:border-emerald-500/30 transition-all hover:shadow-md h-full" onClick={() => { chatService.switchSession(session.id); navigate('/'); }}>
                  <CardHeader className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100">{new Date(session.lastActive).toLocaleDateString()}</Badge>
                      <Bookmark className="h-4 w-4 text-muted-foreground opacity-50" />
                    </div>
                    <CardTitle className="text-base line-clamp-2 leading-tight hover:text-emerald-600 transition-colors">{session.title}</CardTitle>
                    <CardDescription className="text-xs pt-1">Stored {new Date(session.createdAt).toLocaleTimeString()}</CardDescription>
                  </CardHeader>
                </Card>
              </motion.div>
            ))}
            {filteredSessions.length === 0 && (
              <div className="col-span-full py-16 text-center space-y-4 bg-muted/20 rounded-3xl border-2 border-dashed">
                <Activity className="h-10 w-10 mx-auto text-muted-foreground/30" />
                <p className="text-muted-foreground font-medium">No medical records found.</p>
              </div>
            )}
          </div>
        </section>
        <aside className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-soft glass overflow-hidden">
            <CardHeader className="bg-emerald-600 text-white"><CardTitle className="text-lg flex items-center gap-2"><BookOpen className="h-5 w-5" /> Health Library</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {[{ title: "Blood Pressure Basics", tag: "Hypertension", icon: Heart }, { title: "Seasonal Wellness", tag: "Allergies", icon: Activity }].map((item, idx) => (
                  <div key={idx} className="p-4 hover:bg-muted/50 cursor-pointer group flex gap-4">
                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><item.icon className="h-5 w-5" /></div>
                    <div><h4 className="text-sm font-medium group-hover:text-emerald-600">{item.title}</h4><Badge variant="outline" className="text-[10px] py-0">{item.tag}</Badge></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="bg-slate-900 text-white p-6 rounded-3xl space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Optimization</h4>
            <div className="flex justify-between items-end"><span className="text-3xl font-bold">{sessions.length}</span><span className="text-xs text-slate-400">Records Cached</span></div>
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: '80%' }} className="h-full bg-emerald-500" /></div>
          </div>
        </aside>
      </div>
    </div>
  );
}