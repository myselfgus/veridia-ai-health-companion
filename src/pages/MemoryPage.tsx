import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  BrainCircuit, 
  Search, 
  BookOpen, 
  Bookmark, 
  TrendingUp, 
  Activity,
  Heart
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
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
      if (res.success && res.data) {
        setSessions(res.data);
      }
    };
    loadData();
  }, []);
  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="py-8 md:py-12 lg:py-16">
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/')} 
              className="group -ml-3 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Back to Chat
            </Button>
            <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
              Health Memory
            </h1>
            <p className="text-muted-foreground">
              Explore your persistent health insights, records, and educational notes.
            </p>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search health records..." 
              className="pl-10 h-11 bg-white dark:bg-slate-900 border-input shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Content: Health Insights */}
          <section className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-emerald-500" />
                Clinical Records
              </h2>
              <Badge variant="secondary" className="font-mono">{filteredSessions.length} Total</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSessions.map((session, i) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card 
                    className="group cursor-pointer hover:border-emerald-500/30 transition-all hover:shadow-lg bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-border"
                    onClick={() => {
                      chatService.switchSession(session.id);
                      navigate('/');
                    }}
                  >
                    <CardHeader className="p-5">
                      <div className="flex items-start justify-between">
                        <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20 mb-2">
                          {new Date(session.lastActive).toLocaleDateString()}
                        </Badge>
                        <Bookmark className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <CardTitle className="text-base line-clamp-2 leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {session.title}
                      </CardTitle>
                      <CardDescription className="text-xs pt-1">
                        Analyzed {new Date(session.createdAt).toLocaleTimeString()}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </motion.div>
              ))}
              {filteredSessions.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-4">
                  <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                    <Activity className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">No records found</p>
                    <p className="text-sm text-muted-foreground">Try starting a new conversation with Veridia.</p>
                  </div>
                </div>
              )}
            </div>
          </section>
          {/* Sidebar: Educational Content */}
          <aside className="lg:col-span-4 space-y-6">
            <Card className="border-none shadow-soft glass dark:glass-dark overflow-hidden">
              <CardHeader className="bg-emerald-600 text-white">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Health Library
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <div className="divide-y divide-border">
                    {[
                      { title: "Understanding Blood Pressure", tag: "Hypertension", icon: Heart },
                      { title: "Seasonal Allergy Management", tag: "Wellness", icon: TrendingUp },
                      { title: "Medication Adherence Tips", tag: "Medication", icon: Activity },
                      { title: "Macronutrient Breakdown", tag: "Nutrition", icon: BookOpen }
                    ].map((item, idx) => (
                      <div key={idx} className="p-4 hover:bg-muted/50 transition-colors cursor-pointer group">
                        <div className="flex gap-4">
                          <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg text-emerald-600">
                            <item.icon className="h-5 w-5" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium group-hover:text-emerald-600 transition-colors">{item.title}</h4>
                            <Badge variant="outline" className="text-[10px] py-0">{item.tag}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
            <Card className="bg-slate-950 text-white border-none shadow-xl">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Insight Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-3xl font-bold">{sessions.length}</span>
                  <span className="text-xs text-slate-400">Total Consultations</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: '65%' }}
                    className="h-full bg-emerald-500" 
                  />
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed uppercase tracking-widest font-semibold">
                  Memory Optimization: 65% Complete
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}