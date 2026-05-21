import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  HeartPulse,
  History,
  Home,
  MessageCircle,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cellApi, DEFAULT_PATIENT_ID, readFileAsBase64 } from '@/lib/cell';
import { chatService, MODELS } from '@/lib/chat';
import { cn } from '@/lib/utils';
import type { DashboardSummary, TimelineEvent, VaultObject } from '../../worker/types';

type View = 'today' | 'vault' | 'journey';
type Intent = 'consulta' | 'sintoma' | 'documento' | 'checkin';

const views: Array<{ id: View; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'today', label: 'Hoje', icon: Home },
  { id: 'vault', label: 'Arquivos', icon: Archive },
  { id: 'journey', label: 'Jornada', icon: History },
];

const intents: Array<{
  id: Intent;
  title: string;
  body: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'consulta',
    title: 'Preparar consulta',
    body: 'Organizar relato, perguntas e o que levar.',
    prompt: 'Quero preparar uma consulta. Me ajude a organizar sintomas, perguntas e documentos importantes.',
    icon: CalendarDays,
  },
  {
    id: 'sintoma',
    title: 'Entender um sintoma',
    body: 'Separar contexto, sinais de alerta e proximos passos.',
    prompt: 'Estou sentindo algo e quero organizar melhor: quando comecou, intensidade, o que muda e o que devo observar.',
    icon: HeartPulse,
  },
  {
    id: 'documento',
    title: 'Guardar exame',
    body: 'Enviar PDF, imagem, receita ou laudo para seu cofre.',
    prompt: 'Quero enviar um documento de saude e entender como ele entra na minha jornada.',
    icon: Upload,
  },
  {
    id: 'checkin',
    title: 'Check-in rapido',
    body: 'Registrar humor, sono, stress e como voce esta.',
    prompt: 'Quero fazer um check-in rapido de hoje e registrar como estou.',
    icon: MessageCircle,
  },
];

const fallbackPlan = [
  'Escrever o que aconteceu em uma frase simples.',
  'Separar sinais, contexto e documentos relacionados.',
  'Transformar isso em pergunta clara para seu profissional de saude.',
];

const defaultEnglishPlan = new Set([
  'One short daily check-in for mood, sleep, stress, and context.',
  'Attach or upload any new exam, PDF, image, or care note.',
  'Convert the week into clinician-ready questions before appointments.',
]);

function VeridiaMark() {
  return (
    <div className="flex size-10 items-center justify-center rounded-[14px] bg-white shadow-sm shadow-neutral-950/10">
      <div className="relative size-6">
        <div className="absolute left-0 top-0 h-6 w-3 rounded-full bg-gradient-to-b from-emerald-700 to-sky-400 [clip-path:polygon(50%_0,100%_22%,62%_100%,50%_76%,38%_100%,0_22%)]" />
        <div className="absolute right-0 top-0 h-6 w-3 rounded-full bg-gradient-to-b from-sky-500 to-emerald-500 [clip-path:polygon(50%_0,100%_22%,62%_100%,50%_76%,38%_100%,0_22%)]" />
      </div>
    </div>
  );
}

export function PatientHomePage() {
  const [patientId] = useState(() => localStorage.getItem('veridia_patient_id') || DEFAULT_PATIENT_ID);
  const [view, setView] = useState<View>('today');
  const [intent, setIntent] = useState<Intent>('consulta');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [vault, setVault] = useState<VaultObject[]>([]);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [journal, setJournal] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedIntent = useMemo(() => intents.find((item) => item.id === intent) || intents[0], [intent]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummary, nextTimeline, nextVault] = await Promise.all([
        cellApi.summary(patientId),
        cellApi.timeline(patientId),
        cellApi.vault(patientId),
      ]);
      setSummary(nextSummary);
      setTimeline(nextTimeline);
      setVault(nextVault);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao consegui carregar seu espaco.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    localStorage.setItem('veridia_patient_id', patientId);
    load();
  }, [load, patientId]);

  const firstName = summary?.patient.displayName && summary.patient.displayName !== 'Demo Patient'
    ? summary.patient.displayName.split(' ')[0]
    : 'Gustavo';

  const uploadFile = async (file: File) => {
    setBusy(true);
    try {
      const contentBase64 = await readFileAsBase64(file);
      await cellApi.uploadVaultObject(patientId, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
      });
      toast.success('Documento guardado no seu cofre.');
      await load();
      setView('vault');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao consegui guardar este arquivo.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const continueCare = async (override?: string) => {
    const text = (override || message || selectedIntent.prompt).trim();
    if (!text) return;
    setBusy(true);
    setMessage('');
    setAnswer('');
    try {
      let streamed = '';
      const result = await chatService.sendMessage(text, MODELS[0].id, (chunk) => {
        streamed += chunk;
        setAnswer(streamed);
      });
      if (!result.success || streamed.toLowerCase().includes('temporary issue')) {
        setAnswer('Vamos organizar com seguranca: quando comecou, intensidade, frequencia, o que melhora ou piora, remedios em uso, documentos relacionados e sinais de alerta. Se for intenso, subito, progressivo ou preocupante, procure atendimento qualificado.');
      }
      await cellApi.createTimelineEvent(patientId, {
        type: 'note',
        title: selectedIntent.title,
        summary: text,
        sourceType: 'chat',
      }).catch(() => undefined);
      await load();
    } catch {
      setAnswer('Nao consegui responder agora. Seu registro foi compreendido; tente novamente em instantes.');
    } finally {
      setBusy(false);
    }
  };

  const saveCheckin = async () => {
    if (!journal.trim()) return;
    setBusy(true);
    try {
      await cellApi.checkIn(patientId, { mood: 7, sleepHours: 7, stress: 4, note: journal.trim() });
      setJournal('');
      toast.success('Check-in salvo na sua jornada.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao consegui salvar seu check-in.');
    } finally {
      setBusy(false);
    }
  };

  const startIntent = (nextIntent: Intent) => {
    setIntent(nextIntent);
    const next = intents.find((item) => item.id === nextIntent);
    if (nextIntent === 'documento') {
      fileInputRef.current?.click();
      return;
    }
    if (nextIntent === 'checkin') {
      setView('journey');
      setJournal('Hoje eu estou me sentindo ');
      return;
    }
    setView('today');
    setMessage(next?.prompt || '');
  };

  const planItems = summary?.therapy.weeklyPlan?.some((item) => defaultEnglishPlan.has(item))
    ? fallbackPlan
    : summary?.therapy.weeklyPlan?.length
      ? summary.therapy.weeklyPlan
      : fallbackPlan;

  return (
    <div className="min-h-screen bg-[#f6f7f4] pb-24 text-neutral-950 lg:pb-0">
      <Toaster richColors position="top-center" />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadFile(file);
        }}
      />

      <div className="mx-auto grid min-h-screen w-full max-w-[1380px] lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden border-r border-neutral-200/80 bg-white/70 px-5 py-7 backdrop-blur-xl lg:block">
          <div className="flex items-center gap-3">
            <VeridiaMark />
            <span className="veridia-display text-3xl">Veridia</span>
          </div>
          <nav className="mt-10 space-y-2">
            {views.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cn(
                    'flex h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm transition',
                    view === item.id ? 'border border-neutral-200 bg-white text-emerald-700 shadow-sm' : 'text-neutral-600 hover:bg-white/80',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-10 rounded-[18px] border border-neutral-200 bg-white p-4">
            <ShieldCheck className="size-5 text-emerald-700" />
            <p className="mt-3 text-sm font-medium">Privacidade primeiro</p>
            <p className="mt-2 text-xs leading-5 text-neutral-500">Dados usados apenas para organizar seu cuidado neste espaco.</p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 lg:hidden">
              <VeridiaMark />
              <span className="veridia-display text-2xl">Veridia</span>
            </div>
            <div className="hidden lg:block">
              <h1 className="veridia-display text-5xl leading-none">Bom dia, {firstName}</h1>
              <p className="mt-2 text-sm text-neutral-500">Um lugar para transformar preocupacao em proximo passo.</p>
            </div>
            <Button variant="outline" size="icon" className="rounded-xl bg-white" onClick={load} disabled={loading}>
              <RefreshCcw className="size-4" />
            </Button>
          </header>

          {view === 'today' && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
              <section className="min-w-0">
                <div className="lg:hidden">
                  <h1 className="veridia-display text-4xl leading-none">Bom dia, {firstName}</h1>
                  <p className="mt-2 text-sm text-neutral-500">Vamos cuidar de uma coisa por vez.</p>
                </div>

                <div className="mt-5 rounded-[28px] border border-neutral-200 bg-white/85 p-4 shadow-sm shadow-neutral-950/[0.04] backdrop-blur-xl lg:mt-0 lg:p-7">
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                    {intents.map((item) => {
                      const Icon = item.icon;
                      const active = intent === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => startIntent(item.id)}
                          className={cn(
                            'min-h-24 rounded-2xl border p-3 text-left transition sm:min-h-28 sm:p-4',
                            active ? 'border-emerald-600 bg-emerald-50/70 shadow-sm' : 'border-neutral-200 bg-white hover:border-emerald-300',
                          )}
                        >
                          <Icon className={cn('size-5', active ? 'text-emerald-700' : 'text-neutral-500')} />
                          <div className="mt-3 text-sm font-semibold sm:mt-4">{item.title}</div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500 sm:line-clamp-none">{item.body}</p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-7 overflow-hidden rounded-[24px] border border-neutral-200 bg-[#fbfcfb]">
                    <div className="relative p-5 sm:p-8">
                      <div className="absolute right-0 top-0 hidden h-full w-48 bg-[radial-gradient(circle_at_70%_24%,rgba(44,128,92,0.16),transparent_34%),linear-gradient(135deg,transparent,rgba(84,141,147,0.11))] sm:block" />
                      <div className="relative max-w-3xl">
                        <div className="flex items-center gap-3">
                          <VeridiaMark />
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Agora</p>
                            <h2 className="veridia-display text-4xl leading-tight sm:text-5xl">O que voce quer cuidar?</h2>
                          </div>
                        </div>
                        <Textarea
                          value={message}
                          onChange={(event) => setMessage(event.target.value)}
                          placeholder="Ex: estou com dor de cabeca ha 3 dias e tenho uma consulta na sexta..."
                          className="mt-7 min-h-36 resize-none rounded-2xl border-neutral-200 bg-white p-4 text-base leading-7 shadow-sm focus-visible:ring-emerald-700"
                        />
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs leading-5 text-neutral-500">A Veridia organiza, mas nao substitui seu medico ou servico de emergencia.</p>
                          <Button className="h-12 rounded-xl px-5" onClick={() => continueCare()} disabled={busy}>
                            <Send className="size-4" />
                            Continuar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <section className="rounded-[22px] bg-neutral-950 p-5 text-white">
                      <div className="flex items-center gap-2 text-sm text-neutral-300">
                        <MessageCircle className="size-4" />
                        Resposta da Veridia
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-base leading-7">
                        {answer || 'Escolha uma intencao ou escreva livremente. Eu transformo isso em contexto, perguntas e proximos passos.'}
                      </p>
                    </section>
                    <section className="rounded-[22px] border border-neutral-200 bg-white p-5">
                      <div className="text-sm font-semibold">Plano curto</div>
                      <div className="mt-4 space-y-3">
                        {planItems.slice(0, 3).map((item, index) => (
                          <div key={item} className="flex gap-3 text-sm leading-5">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700">{index + 1}</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </section>

              <aside className="space-y-4">
                <Panel title="Seu estado" icon={HeartPulse}>
                  <div className="space-y-3">
                    <StateRow label="Humor" value={summary?.therapy.lastCheckin?.mood ? `${summary.therapy.lastCheckin.mood}/10` : 'sem registro'} />
                    <StateRow label="Sono" value={summary?.therapy.lastCheckin?.sleepHours ? `${summary.therapy.lastCheckin.sleepHours}h` : 'sem registro'} />
                    <StateRow label="Stress" value={summary?.therapy.lastCheckin?.stress ? `${summary.therapy.lastCheckin.stress}/10` : 'sem registro'} />
                  </div>
                </Panel>
                <Panel title="Cofre de saude" icon={FileText}>
                  <button className="flex w-full items-center justify-between rounded-xl border border-dashed border-neutral-300 bg-white p-3 text-left text-sm" onClick={() => fileInputRef.current?.click()}>
                    Enviar documento
                    <Upload className="size-4" />
                  </button>
                  <p className="mt-3 text-xs leading-5 text-neutral-500">{vault.length || 'Nenhum'} arquivo guardado.</p>
                </Panel>
                <Panel title="Jornada recente" icon={History}>
                  <div className="space-y-3">
                    {(timeline.length ? timeline.slice(0, 3) : []).map((item) => (
                      <button key={item.id} onClick={() => setView('journey')} className="block w-full rounded-xl bg-neutral-50 p-3 text-left">
                        <div className="truncate text-sm font-medium">{item.title}</div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{item.summary}</p>
                      </button>
                    ))}
                    {timeline.length === 0 && <p className="text-sm leading-6 text-neutral-500">Ainda sem registros. Comece por uma conversa ou check-in.</p>}
                  </div>
                </Panel>
              </aside>
            </div>
          )}

          {view === 'vault' && (
            <div className="grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
              <Panel title="Guardar arquivo" icon={Upload}>
                <p className="text-sm leading-6 text-neutral-600">Envie exame, laudo, receita, imagem ou PDF. Ele fica associado a sua jornada.</p>
                <Button className="mt-5 h-12 w-full rounded-xl" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  Selecionar arquivo
                </Button>
              </Panel>
              <section className="space-y-3">
                {vault.length === 0 && <EmptyState text="Nenhum documento ainda. Envie um arquivo para comecar seu cofre de saude." />}
                {vault.map((item) => (
                  <div key={item.id} className="rounded-[20px] border border-neutral-200 bg-white p-4 shadow-sm shadow-neutral-950/[0.025]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{item.filename}</div>
                        <p className="mt-2 text-sm leading-6 text-neutral-600">{item.summary || 'Documento guardado para consulta futura.'}</p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">{item.status}</span>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          )}

          {view === 'journey' && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section className="space-y-3">
                <div className="rounded-[24px] border border-neutral-200 bg-white p-5">
                  <h2 className="veridia-display text-3xl">Sua jornada</h2>
                  <p className="mt-2 text-sm text-neutral-500">Conversas, check-ins e documentos em uma linha do tempo simples.</p>
                </div>
                {timeline.length === 0 && <EmptyState text="Nada registrado ainda. Use a tela Hoje para conversar ou salve um check-in." />}
                {timeline.map((item) => (
                  <article key={item.id} className="rounded-[20px] border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-950/[0.025]">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-neutral-400">{item.type}</div>
                    <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{item.summary}</p>
                  </article>
                ))}
              </section>
              <Panel title="Check-in de hoje" icon={HeartPulse}>
                <Textarea
                  value={journal}
                  onChange={(event) => setJournal(event.target.value)}
                  placeholder="Como voce esta hoje?"
                  className="min-h-36 resize-none rounded-xl"
                />
                <Button className="mt-3 h-11 w-full rounded-xl" onClick={saveCheckin} disabled={busy || !journal.trim()}>
                  Salvar check-in
                </Button>
              </Panel>
            </div>
          )}
        </main>
      </div>

      <nav className="mx-3 mb-4 mt-2 grid grid-cols-4 rounded-[24px] border border-neutral-200 bg-white/95 p-1 shadow-lg shadow-neutral-950/10 backdrop-blur-xl lg:hidden">
        {views.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => setView(item.id)} className={cn('flex h-14 flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] font-medium', view === item.id ? 'text-emerald-700' : 'text-neutral-500')}>
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
        <button className="flex h-14 flex-col items-center justify-center gap-1 rounded-[18px] text-neutral-900" onClick={() => fileInputRef.current?.click()}>
          <Plus className="size-5" />
          Enviar
        </button>
      </nav>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-neutral-200 bg-white/84 p-5 shadow-sm shadow-neutral-950/[0.03] backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4" />
        {title}
      </div>
      {children}
    </section>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-3 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-neutral-300 bg-white/70 p-8 text-center text-sm leading-6 text-neutral-500">
      {text}
      <ChevronRight className="mx-auto mt-4 size-4 text-neutral-300" />
    </div>
  );
}
