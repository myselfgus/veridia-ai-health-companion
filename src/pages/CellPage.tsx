import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Archive,
  ArrowRight,
  BookOpenCheck,
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Database,
  Download,
  FileText,
  Fingerprint,
  HeartPulse,
  History,
  LockKeyhole,
  MessageCircle,
  Microscope,
  RefreshCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Workflow,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cellApi, DEFAULT_PATIENT_ID, readFileAsBase64 } from '@/lib/cell';
import { cn } from '@/lib/utils';
import type {
  DashboardSummary,
  MemoryRecord,
  ResearchCapture,
  TherapyCheckin,
  TimelineEvent,
  VaultObject,
} from '../../worker/types';

type SectionId = 'dashboard' | 'companion' | 'vault' | 'timeline' | 'therapy' | 'research' | 'settings';

const sections: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'companion', label: 'Companion', icon: Bot },
  { id: 'vault', label: 'Vault', icon: Archive },
  { id: 'timeline', label: 'Timeline', icon: History },
  { id: 'therapy', label: 'Therapy', icon: HeartPulse },
  { id: 'research', label: 'Research', icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const modeCards = [
  { title: 'AI Twin', detail: 'Context, memory, plans', icon: Brain, color: 'text-emerald-600' },
  { title: 'Consulta medica', detail: 'Questions and visit prep', icon: Microscope, color: 'text-blue-600' },
  { title: 'Exames', detail: 'Files, summaries, signals', icon: FileText, color: 'text-violet-600' },
  { title: 'Rotina', detail: 'Sleep, hydration, habits', icon: CalendarClock, color: 'text-amber-600' },
];

export function CellPage() {
  const [patientId, setPatientId] = useState(() => localStorage.getItem('veridia_patient_id') || DEFAULT_PATIENT_ID);
  const [activeSection, setActiveSection] = useState<SectionId>('dashboard');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [vault, setVault] = useState<VaultObject[]>([]);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [research, setResearch] = useState<ResearchCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ragQuery, setRagQuery] = useState('sleep');
  const [ragResult, setRagResult] = useState<string>('Patient filter not queried yet.');
  const [timelineDraft, setTimelineDraft] = useState({ title: '', summary: '' });
  const [memoryDraft, setMemoryDraft] = useState('');
  const [researchUrl, setResearchUrl] = useState('https://medlineplus.gov/sleepdisorders.html');
  const [checkin, setCheckin] = useState({ mood: 6, sleepHours: 7, stress: 4, note: '' });
  const [lastCheckin, setLastCheckin] = useState<TherapyCheckin | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadCell = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummary, nextTimeline, nextVault, nextMemories, nextResearch] = await Promise.all([
        cellApi.summary(patientId),
        cellApi.timeline(patientId),
        cellApi.vault(patientId),
        cellApi.memories(patientId),
        cellApi.researchCaptures(patientId),
      ]);
      setSummary(nextSummary);
      setTimeline(nextTimeline);
      setVault(nextVault);
      setMemories(nextMemories);
      setResearch(nextResearch);
      setLastCheckin(nextSummary.therapy.lastCheckin || null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Veridia Cell');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    localStorage.setItem('veridia_patient_id', patientId);
    loadCell();
  }, [loadCell, patientId]);

  const bindingScore = useMemo(() => {
    if (!summary) return 0;
    const values = Object.values(summary.bindings);
    return Math.round((values.filter(Boolean).length / values.length) * 100);
  }, [summary]);

  const uploadFile = async (file: File) => {
    setBusy(true);
    try {
      const contentBase64 = await readFileAsBase64(file);
      await cellApi.uploadVaultObject(patientId, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
      });
      toast.success('Vault object saved and queued');
      await loadCell();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addTimelineNote = async () => {
    if (!timelineDraft.title.trim() || !timelineDraft.summary.trim()) {
      toast.error('Add a title and summary');
      return;
    }
    setBusy(true);
    try {
      await cellApi.createTimelineEvent(patientId, {
        type: 'note',
        title: timelineDraft.title,
        summary: timelineDraft.summary,
        sourceType: 'manual',
      });
      setTimelineDraft({ title: '', summary: '' });
      toast.success('Timeline updated');
      await loadCell();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add note');
    } finally {
      setBusy(false);
    }
  };

  const saveMemory = async () => {
    if (!memoryDraft.trim()) return;
    setBusy(true);
    try {
      await cellApi.saveMemory(patientId, memoryDraft.trim());
      setMemoryDraft('');
      toast.success('Memory saved');
      await loadCell();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save memory');
    } finally {
      setBusy(false);
    }
  };

  const runRagQuery = async () => {
    if (!ragQuery.trim()) return;
    setBusy(true);
    try {
      const result = await cellApi.ragQuery(patientId, ragQuery);
      const total = result.memories.length + result.timeline.length + result.vault.length + result.research.length;
      setRagResult(`${total} scoped matches via ${result.source}; enforced patientId=${result.enforcedFilter.patientId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'RAG query failed');
    } finally {
      setBusy(false);
    }
  };

  const submitCheckin = async () => {
    setBusy(true);
    try {
      const result = await cellApi.checkIn(patientId, checkin);
      setLastCheckin(result);
      toast.success(result.escalationMarker ? 'Check-in saved with safety marker' : 'Check-in saved');
      await loadCell();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Check-in failed');
    } finally {
      setBusy(false);
    }
  };

  const captureSource = async () => {
    if (!researchUrl.trim()) return;
    setBusy(true);
    try {
      const capture = await cellApi.captureSource(patientId, researchUrl.trim());
      toast.success(capture.status === 'captured' ? 'Source captured' : 'Source blocked by allowlist');
      await loadCell();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Capture failed');
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const data = await cellApi.exportData(patientId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `veridia-${patientId}-export.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Export generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    setBusy(true);
    try {
      await cellApi.deleteDocument(patientId, documentId);
      toast.success('Document deleted');
      await loadCell();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const content = () => {
    if (!summary) {
      return (
        <div className="flex min-h-[420px] items-center justify-center">
          <div className="text-sm text-muted-foreground">{loading ? 'Loading Veridia Cell...' : 'No cell data yet.'}</div>
        </div>
      );
    }

    if (activeSection === 'companion') {
      return (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-lg border-neutral-200 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MessageCircle className="size-5" />
                Companion workspace
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {modeCards.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <div key={mode.title} className="rounded-lg border bg-background p-4">
                      <Icon className={cn('size-5', mode.color)} />
                      <div className="mt-4 text-sm font-medium">{mode.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{mode.detail}</div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-sm font-medium">Scoped retrieval test</div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input value={ragQuery} onChange={(event) => setRagQuery(event.target.value)} />
                  <Button onClick={runRagQuery} disabled={busy}>
                    <Search className="mr-2 size-4" />
                    Query
                  </Button>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{ragResult}</p>
              </div>
              <Link to="/companion">
                <Button className="h-11 rounded-lg">
                  Open full chat
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
          <SidePanel title="Memory candidates" icon={Sparkles}>
            <Textarea
              value={memoryDraft}
              onChange={(event) => setMemoryDraft(event.target.value)}
              placeholder="Save a user-approved long-term fact"
              className="min-h-28 resize-none"
            />
            <Button onClick={saveMemory} disabled={busy || !memoryDraft.trim()} className="mt-3 w-full">
              Save memory
            </Button>
            <div className="mt-4 space-y-3">
              {memories.slice(0, 4).map((memory) => (
                <SmallRecord key={memory.id} title={memory.category} detail={memory.content} />
              ))}
            </div>
          </SidePanel>
        </section>
      );
    }

    if (activeSection === 'vault') {
      return (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Upload className="size-5" />
                Health Vault
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed p-5 text-center">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">PDFs, images, notes, exports</p>
                <Button className="mt-4 h-10 rounded-lg" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  Choose file
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadFile(file);
                  }}
                />
              </div>
              <div className="mt-5 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
                R2 key prefix: <span className="font-mono text-foreground">patients/{patientId}/vault</span>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            {vault.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.filename}</span>
                    <StatusBadge status={item.status} />
                    <Badge variant="outline">{item.category}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.summary || item.r2Key}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => cellApi.processDocument(patientId, item.id).then(loadCell)}>
                    <RefreshCcw className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => deleteDocument(item.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            {vault.length === 0 && <EmptyLine text="No vault documents yet." />}
          </div>
        </section>
      );
    }

    if (activeSection === 'timeline') {
      return (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-xl">Add event</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={timelineDraft.title}
                onChange={(event) => setTimelineDraft((draft) => ({ ...draft, title: event.target.value }))}
                placeholder="Title"
              />
              <Textarea
                value={timelineDraft.summary}
                onChange={(event) => setTimelineDraft((draft) => ({ ...draft, summary: event.target.value }))}
                placeholder="Clinical-safe summary"
                className="min-h-28 resize-none"
              />
              <Button onClick={addTimelineNote} disabled={busy} className="w-full">
                Add to timeline
              </Button>
            </CardContent>
          </Card>
          <TimelineList items={timeline} />
        </section>
      );
    }

    if (activeSection === 'therapy') {
      return (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <HeartPulse className="size-5" />
                Therapy check-in
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <RangeField label="Mood" value={checkin.mood} min={1} max={10} onChange={(value) => setCheckin((next) => ({ ...next, mood: value }))} />
              <RangeField label="Stress" value={checkin.stress} min={1} max={10} onChange={(value) => setCheckin((next) => ({ ...next, stress: value }))} />
              <div>
                <label className="text-sm font-medium">Sleep hours</label>
                <Input
                  type="number"
                  value={checkin.sleepHours}
                  min={0}
                  max={24}
                  onChange={(event) => setCheckin((next) => ({ ...next, sleepHours: Number(event.target.value) }))}
                  className="mt-2"
                />
              </div>
              <Textarea
                value={checkin.note}
                onChange={(event) => setCheckin((next) => ({ ...next, note: event.target.value }))}
                placeholder="Journal note"
                className="min-h-32 resize-none"
              />
              <Button onClick={submitCheckin} disabled={busy} className="h-11 rounded-lg">
                Save check-in
              </Button>
            </CardContent>
          </Card>
          <SidePanel title="Weekly plan" icon={BookOpenCheck}>
            <div className="space-y-3">
              {summary.therapy.weeklyPlan.map((step) => (
                <SmallRecord key={step} title="Plan step" detail={step} />
              ))}
              {lastCheckin && (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {lastCheckin.escalationMarker ? <CircleAlert className="size-4 text-rose-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
                    Last check-in
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{lastCheckin.planStep}</p>
                </div>
              )}
            </div>
          </SidePanel>
        </section>
      );
    }

    if (activeSection === 'research') {
      return (
        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Search className="size-5" />
                Browser research
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={researchUrl} onChange={(event) => setResearchUrl(event.target.value)} />
              <Button onClick={captureSource} disabled={busy} className="w-full">
                Capture source
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                Allowlisted public health sources are captured with provenance and patient-scoped storage.
              </p>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            {research.map((item) => (
              <div key={item.id} className="rounded-lg border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.status === 'captured' ? 'default' : 'destructive'}>{item.status}</Badge>
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
                <p className="mt-3 truncate font-mono text-xs text-muted-foreground">{item.url}</p>
              </div>
            ))}
            {research.length === 0 && <EmptyLine text="No research captures yet." />}
          </div>
        </section>
      );
    }

    if (activeSection === 'settings') {
      return (
        <section className="grid gap-5 lg:grid-cols-2">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Fingerprint className="size-5" />
                Patient boundary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">patientId</label>
                <Input value={patientId} onChange={(event) => setPatientId(event.target.value)} className="mt-2 font-mono" />
              </div>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Every Cell 1 route reads this value through <span className="font-mono text-foreground">X-Veridia-Patient-Id</span> and filters D1, R2 keys, RAG, audits, and rate limits by it.
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Download className="size-5" />
                Data controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={exportData} disabled={busy} className="w-full">
                Export patient data
              </Button>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Delete controls are active per document today. Full account deletion and auth consent screens are prepared for the next auth phase.
              </div>
            </CardContent>
          </Card>
        </section>
      );
    }

    return (
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Documents" value={summary.stats.documents} icon={Archive} accent="bg-emerald-500" />
            <MetricCard label="Indexed" value={summary.stats.indexedDocuments} icon={Database} accent="bg-blue-500" />
            <MetricCard label="Memories" value={summary.stats.memories} icon={Brain} accent="bg-violet-500" />
            <MetricCard label="Research" value={summary.stats.researchCaptures} icon={Search} accent="bg-amber-500" />
          </div>
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Workflow className="size-5" />
                Active plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{summary.activePlan}</p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {summary.recentTimeline.slice(0, 3).map((item) => (
                  <SmallRecord key={item.id} title={item.title} detail={item.summary} />
                ))}
              </div>
            </CardContent>
          </Card>
          <TimelineList items={summary.recentTimeline} compact />
        </div>
        <SidePanel title="Cell readiness" icon={ShieldCheck}>
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Bindings online</span>
              <span className="font-medium">{bindingScore}%</span>
            </div>
            <Progress value={bindingScore} className="mt-3" />
          </div>
          <BindingGrid bindings={summary.bindings} />
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <LockKeyhole className="mb-2 size-4" />
            {summary.therapy.safetyCopy}
          </div>
        </SidePanel>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_32%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)))] text-foreground">
      <Toaster richColors position="top-center" />
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col lg:flex-row">
        <aside className="border-b bg-background/85 px-4 py-3 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Activity className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Veridia</div>
                <div className="text-xs text-muted-foreground">Cell 1</div>
              </div>
            </div>
            <ThemeToggle className="relative static" />
          </div>
          <nav className="mt-5 grid grid-cols-3 gap-2 lg:grid-cols-1">
            {sections.map((section) => {
              const Icon = section.icon;
              const selected = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm transition lg:justify-start',
                    selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{section.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-5 hidden rounded-lg border bg-muted/40 p-4 lg:block">
            <div className="text-xs uppercase tracking-normal text-muted-foreground">tenant</div>
            <div className="mt-2 break-all font-mono text-sm">{patientId}</div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 rounded-lg border bg-background/80 p-4 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
                  {summary?.patient.displayName || 'Demo Patient'}
                </h1>
                <Badge variant="outline" className="rounded-md">patient-scoped</Badge>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Digital health twin workspace with vault, timeline, memory, research, therapy check-ins, jobs, and Cloudflare bindings.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadCell} disabled={loading}>
                <RefreshCcw className="mr-2 size-4" />
                Sync
              </Button>
              <Link to="/companion">
                <Button>
                  <MessageCircle className="mr-2 size-4" />
                  Chat
                </Button>
              </Link>
            </div>
          </header>
          {content()}
        </main>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className={cn('size-2 rounded-full', accent)} />
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-6 text-3xl font-semibold">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function SidePanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="size-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function SmallRecord({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="text-sm font-medium">{title}</div>
      <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function TimelineList({ items, compact = false }: { items: TimelineEvent[]; compact?: boolean }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <History className="size-4" />
          Timeline
        </div>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="relative pl-5">
            <div className="absolute left-0 top-1.5 size-2 rounded-full bg-primary" />
            <div className="text-sm font-medium">{item.title}</div>
            <p className={cn('mt-1 text-sm leading-6 text-muted-foreground', compact && 'line-clamp-2')}>{item.summary}</p>
            <div className="mt-2 text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString()}</div>
          </div>
        ))}
        {items.length === 0 && <EmptyLine text="No timeline events yet." />}
      </div>
    </div>
  );
}

function BindingGrid({ bindings }: { bindings: DashboardSummary['bindings'] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(bindings).map(([name, ready]) => (
        <div key={name} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
          <span className="capitalize text-muted-foreground">{name.replace(/([A-Z])/g, ' $1')}</span>
          <span className={cn('size-2 rounded-full', ready ? 'bg-emerald-500' : 'bg-neutral-300')} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'indexed' ? 'default' : status === 'failed' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{status}</Badge>;
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label className="font-medium">{label}</label>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 h-2 w-full accent-primary"
      />
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</div>;
}
