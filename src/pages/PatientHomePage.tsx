import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Archive,
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  FileText,
  HeartPulse,
  History,
  Home,
  LockKeyhole,
  MessageCircle,
  Moon,
  Plus,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cellApi, DEFAULT_PATIENT_ID, readFileAsBase64 } from '@/lib/cell';
import { chatService, MODELS } from '@/lib/chat';
import { cn } from '@/lib/utils';
import type { DashboardSummary, TimelineEvent, VaultObject } from '../../worker/types';

type PatientSection = 'today' | 'talk' | 'files' | 'journey';

const navItems: Array<{ id: PatientSection; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'today', label: 'Hoje', icon: Home },
  { id: 'talk', label: 'Conversar', icon: MessageCircle },
  { id: 'files', label: 'Arquivos', icon: Archive },
  { id: 'journey', label: 'Jornada', icon: History },
];

const gentlePrompts = [
  'Quero entender um sintoma sem entrar em pânico.',
  'Me ajude a preparar uma consulta.',
  'Organize um plano leve para esta semana.',
  'Leia um exame e transforme em perguntas para o médico.',
];

const companionModes = [
  { label: 'Me entender', detail: 'contexto, sintomas e rotina', icon: Sparkles },
  { label: 'Consulta', detail: 'perguntas e resumo médico', icon: CalendarDays },
  { label: 'Exames', detail: 'explicação cuidadosa', icon: FileText },
  { label: 'Desabafar', detail: 'apoio e aterramento', icon: HeartPulse },
];

const getFileTone = (item: VaultObject) => {
  if (item.status === 'indexed') return 'Resumo pronto';
  if (item.status === 'failed') return 'Precisa de atenção';
  if (item.status === 'processing' || item.status === 'queued') return 'Estou preparando';
  return 'Guardado com segurança';
};

export function PatientHomePage() {
  const [patientId] = useState(() => localStorage.getItem('veridia_patient_id') || DEFAULT_PATIENT_ID);
  const [active, setActive] = useState<PatientSection>('today');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [vault, setVault] = useState<VaultObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('Estou aqui. Conte em uma frase o que você quer cuidar agora.');
  const [journal, setJournal] = useState('');
  const [chatgptLinked, setChatgptLinked] = useState(() => localStorage.getItem('veridia_chatgpt_linked') === 'true');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPatientSpace = useCallback(async () => {
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
      toast.error(error instanceof Error ? error.message : 'Nao consegui carregar seu espaco de saude');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    localStorage.setItem('veridia_patient_id', patientId);
    loadPatientSpace();
  }, [loadPatientSpace, patientId]);

  const readiness = useMemo(() => {
    if (!summary) return 0;
    const patientFacing = [
      summary.bindings.d1,
      summary.bindings.queue,
      summary.bindings.workflow,
      summary.bindings.ai,
      summary.bindings.browser,
      summary.bindings.vectorize,
    ];
    return Math.round((patientFacing.filter(Boolean).length / patientFacing.length) * 100);
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
      toast.success('Documento guardado. Vou preparar um resumo para sua jornada.');
      await loadPatientSpace();
      setActive('files');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao consegui guardar este arquivo');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendCompanionMessage = async (content = message) => {
    const clean = content.trim();
    if (!clean) return;
    setBusy(true);
    setMessage('');
    setReply('');
    try {
      let streamed = '';
      const result = await chatService.sendMessage(clean, MODELS[0].id, (chunk) => {
        streamed += chunk;
        setReply(streamed);
      });
      if (streamed.toLowerCase().includes('temporary issue') || streamed.toLowerCase().includes('try again')) {
        setReply(
          `Tive uma instabilidade no motor de resposta, mas consigo te ajudar a organizar a consulta sobre isso. Leve anotado: quando comecou, frequencia, intensidade, o que melhora ou piora, remedios ou suplementos em uso, exames recentes e qualquer sinal novo ou preocupante.`,
        );
      }
      if (!result.success && !streamed) {
        setReply(
          `Posso te ajudar a organizar isso com cuidado. Sobre "${clean}", vamos separar: quando comecou, intensidade, o que mudou recentemente, medicamentos, exames e sinais de alerta. Se for algo forte, subito ou piorando, procure atendimento qualificado.`,
        );
      }
      await cellApi.createTimelineEvent(patientId, {
        type: 'note',
        title: 'Conversa com Veridia',
        summary: clean,
        sourceType: 'chat',
      }).catch(() => undefined);
      await loadPatientSpace();
    } catch (error) {
      setReply('Tive uma falha agora, mas seu pedido ficou claro. Tente novamente em instantes.');
    } finally {
      setBusy(false);
    }
  };

  const saveJournal = async () => {
    if (!journal.trim()) return;
    setBusy(true);
    try {
      await cellApi.checkIn(patientId, {
        mood: 6,
        sleepHours: 7,
        stress: 4,
        note: journal.trim(),
      });
      setJournal('');
      toast.success('Check-in salvo na sua jornada.');
      await loadPatientSpace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao consegui salvar seu check-in');
    } finally {
      setBusy(false);
    }
  };

  const connectChatGPT = () => {
    localStorage.setItem('veridia_chatgpt_linked', 'true');
    setChatgptLinked(true);
    toast.success('Entrada preparada. A conexao real exige o fluxo OAuth/Codex App Server.');
  };

  const content = () => {
    if (!summary) {
      return (
        <div className="grid min-h-[520px] place-items-center">
          <div className="text-sm text-neutral-500">{loading ? 'Abrindo seu espaco Veridia...' : 'Ainda nao ha dados para mostrar.'}</div>
        </div>
      );
    }

    if (active === 'talk') {
      return (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="veridia-panel p-4 sm:p-6 lg:p-8">
            <div className="max-w-3xl">
              <p className="text-sm text-neutral-500">Conversa cuidadosa</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-5xl">O que voce quer cuidar agora?</h1>
              <p className="mt-4 text-base leading-7 text-neutral-600">
                Fale como falaria com alguem de confianca. O Veridia usa sua jornada, arquivos e memorias aprovadas para organizar proximos passos.
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {companionModes.map((mode) => {
                const Icon = mode.icon;
                return (
                  <button key={mode.label} className="veridia-tile text-left" onClick={() => setMessage(mode.label)}>
                    <Icon className="size-5 text-neutral-900" />
                    <span className="mt-5 block text-sm font-medium">{mode.label}</span>
                    <span className="mt-1 block text-sm text-neutral-500">{mode.detail}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-8 rounded-[1.45rem] border border-neutral-200 bg-white p-3 shadow-sm">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Escreva aqui: sintomas, medos, duvidas, exames ou algo que voce precisa organizar..."
                className="min-h-28 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
              />
              <div className="flex flex-col gap-3 border-t border-neutral-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-neutral-500">Nao substitui atendimento medico. Ajuda a organizar e preparar.</div>
                <Button className="h-11 rounded-xl" onClick={() => sendCompanionMessage()} disabled={busy || !message.trim()}>
                  Enviar
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-neutral-950 p-5 text-white">
              <div className="flex items-center gap-2 text-sm text-neutral-300">
                <Bot className="size-4" />
                Veridia
              </div>
              <p className="mt-4 whitespace-pre-wrap text-base leading-7">{reply || 'Pensando com cuidado...'}</p>
            </div>
          </div>
          <aside className="flex flex-col gap-4">
            <GlassBlock title="Atalhos humanos" icon={Sparkles}>
              <div className="flex flex-col gap-2">
                {gentlePrompts.map((prompt) => (
                  <button key={prompt} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm text-neutral-700 transition hover:border-neutral-900" onClick={() => sendCompanionMessage(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </GlassBlock>
            <ChatGPTBlock linked={chatgptLinked} onConnect={connectChatGPT} />
          </aside>
        </section>
      );
    }

    if (active === 'files') {
      return (
        <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="veridia-panel p-5 sm:p-6">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
              <Upload className="size-5" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold tracking-normal">Guardar documento</h1>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              Exames, PDFs, imagens e anotacoes entram no seu cofre de saude e podem virar resumo, perguntas e eventos na jornada.
            </p>
            <button className="mt-6 flex w-full flex-col items-center rounded-[1.35rem] border border-dashed border-neutral-300 bg-white px-5 py-8 text-center transition hover:border-neutral-900" onClick={() => fileInputRef.current?.click()}>
              <FileText className="size-8 text-neutral-500" />
              <span className="mt-4 text-sm font-medium">Selecionar arquivo</span>
              <span className="mt-1 text-xs text-neutral-500">PDF, imagem ou documento de saude</span>
            </button>
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
          <div className="flex flex-col gap-3">
            {vault.map((item) => (
              <div key={item.id} className="veridia-row">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100">
                    <FileText className="size-5 text-neutral-700" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.filename}</div>
                    <div className="mt-1 text-sm text-neutral-500">{item.summary || getFileTone(item)}</div>
                  </div>
                </div>
                <Badge variant={item.status === 'indexed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'} className="shrink-0 rounded-md">
                  {getFileTone(item)}
                </Badge>
              </div>
            ))}
            {vault.length === 0 && <EmptyHuman text="Nenhum documento ainda. Quando voce guardar algo, ele aparece aqui com status claro." />}
          </div>
        </section>
      );
    }

    if (active === 'journey') {
      return (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="veridia-panel p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-500">Historia de saude</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal">Sua jornada organizada</h1>
              </div>
              <Button variant="outline" className="hidden rounded-xl sm:inline-flex" onClick={loadPatientSpace}>
                Atualizar
                <RefreshCcw className="size-4" />
              </Button>
            </div>
            <div className="mt-8 flex flex-col gap-5">
              {timeline.map((item) => (
                <article key={item.id} className="relative pl-8">
                  <div className="absolute left-1 top-1.5 size-3 rounded-full bg-neutral-950" />
                  <div className="absolute bottom-[-1.25rem] left-[0.55rem] top-5 w-px bg-neutral-200" />
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-neutral-500">{new Date(item.occurredAt).toLocaleDateString()}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-neutral-600">{item.summary}</p>
                  </div>
                </article>
              ))}
              {timeline.length === 0 && <EmptyHuman text="Sua jornada ainda esta limpa. Conversas, check-ins e documentos importantes vao aparecer aqui." />}
            </div>
          </div>
          <GlassBlock title="Check-in rapido" icon={HeartPulse}>
            <Textarea
              value={journal}
              onChange={(event) => setJournal(event.target.value)}
              placeholder="Como voce esta hoje?"
              className="min-h-32 resize-none rounded-2xl"
            />
            <Button className="mt-3 w-full rounded-xl" onClick={saveJournal} disabled={busy || !journal.trim()}>
              Salvar na jornada
            </Button>
          </GlassBlock>
        </section>
      );
    }

    return (
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="flex flex-col gap-5">
          <div className="veridia-hero p-5 sm:p-8 lg:p-10">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 text-sm text-neutral-500">
                <span>{new Date().toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'long' })}</span>
                <span className="size-1 rounded-full bg-neutral-300" />
                <span>Seu espaco privado de saude</span>
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-normal sm:text-6xl">
                Bom dia, {summary.patient.displayName.split(' ')[0] || 'Gustavo'}.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-600">
                O Veridia junta conversa, documentos, memoria e plano semanal para transformar saude em proximos passos claros.
              </p>
            </div>
            <div className="mt-8 rounded-[1.55rem] border border-neutral-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') sendCompanionMessage();
                  }}
                  placeholder="O que voce quer cuidar agora?"
                  className="h-12 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                />
                <Button className="h-11 rounded-xl" onClick={() => sendCompanionMessage()} disabled={busy || !message.trim()}>
                  Conversar
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <ActionCard icon={Upload} title="Guardar exame" detail="Envie um PDF ou imagem para o cofre." onClick={() => fileInputRef.current?.click()} />
            <ActionCard icon={CalendarDays} title="Preparar consulta" detail="Transforme duvidas em perguntas." onClick={() => sendCompanionMessage('Me ajude a preparar minha proxima consulta.')} />
            <ActionCard icon={HeartPulse} title="Check-in" detail="Registre como voce esta hoje." onClick={() => setActive('journey')} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <GlassBlock title="Plano ativo" icon={Check}>
              <p className="text-sm leading-6 text-neutral-600">{summary.activePlan}</p>
              <div className="mt-5 flex flex-col gap-3">
                {summary.therapy.weeklyPlan.slice(0, 3).map((step) => (
                  <div key={step} className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-3">
                    <Check className="mt-0.5 size-4 text-emerald-600" />
                    <span className="text-sm leading-5 text-neutral-700">{step}</span>
                  </div>
                ))}
              </div>
            </GlassBlock>
            <GlassBlock title="Recentes" icon={Clock3}>
              <div className="flex flex-col gap-3">
                {summary.recentTimeline.slice(0, 3).map((item) => (
                  <button key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-left" onClick={() => setActive('journey')}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="mt-1 line-clamp-1 text-sm text-neutral-500">{item.summary}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-neutral-400" />
                  </button>
                ))}
                {summary.recentTimeline.length === 0 && <EmptyHuman text="Sem eventos recentes ainda." />}
              </div>
            </GlassBlock>
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <GlassBlock title="Seu estado hoje" icon={HeartPulse}>
            <div className="grid grid-cols-3 gap-2">
              <Signal label="Humor" value={summary.therapy.lastCheckin?.mood ? `${summary.therapy.lastCheckin.mood}/10` : 'novo'} />
              <Signal label="Sono" value={summary.therapy.lastCheckin?.sleepHours ? `${summary.therapy.lastCheckin.sleepHours}h` : 'novo'} />
              <Signal label="Stress" value={summary.therapy.lastCheckin?.stress ? `${summary.therapy.lastCheckin.stress}/10` : 'novo'} />
            </div>
            <Progress value={readiness} className="mt-5" />
            <p className="mt-3 text-xs leading-5 text-neutral-500">Sistema de apoio pronto para conversa, arquivos, pesquisa e jornada. Cofre R2 entra quando a conta Cloudflare liberar.</p>
          </GlassBlock>
          <GlassBlock title="Privacidade" icon={ShieldCheck}>
            <p className="text-sm leading-6 text-neutral-600">
              Seus dados ficam separados por paciente. Exportacao e controles de arquivo ja estao disponiveis; identidade real vem na fase de auth.
            </p>
          </GlassBlock>
          <ChatGPTBlock linked={chatgptLinked} onConnect={connectChatGPT} />
        </aside>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-neutral-950">
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
      <div className="mx-auto flex min-h-screen w-full max-w-[1540px]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-neutral-200/80 bg-white/72 px-5 py-5 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                <Activity className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Veridia</div>
                <div className="text-xs text-neutral-500">AI health companion</div>
              </div>
            </div>
            <ThemeToggle className="relative static" />
          </div>
          <nav className="mt-8 flex flex-col gap-1">
            {navItems.map((item) => (
              <NavButton key={item.id} item={item} selected={active === item.id} onClick={() => setActive(item.id)} />
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LockKeyhole className="size-4" />
              Espaco seguro
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Interface do paciente. Console tecnico em <Link to="/ops" className="text-neutral-950 underline">/ops</Link>.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:py-6">
          <header className="mb-5 flex items-center justify-between gap-3 rounded-[1.25rem] border border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                <Activity className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Veridia</div>
                <div className="text-xs text-neutral-500">Hoje</div>
              </div>
            </div>
            <Button variant="outline" size="icon" className="rounded-xl" onClick={loadPatientSpace}>
              <RefreshCcw className="size-4" />
            </Button>
          </header>
          <div className={cn(loading && 'pointer-events-none opacity-70')}>{content()}</div>
        </main>
      </div>

      <nav className="mx-3 mb-3 grid grid-cols-4 rounded-[1.4rem] border border-neutral-200 bg-white/92 p-1 shadow-lg shadow-neutral-950/10 backdrop-blur-xl lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-[1.05rem] text-[11px] font-medium transition',
                selected ? 'bg-neutral-950 text-white' : 'text-neutral-500',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function NavButton({
  item,
  selected,
  onClick,
}: {
  item: { label: string; icon: React.ComponentType<{ className?: string }> };
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
        selected ? 'bg-neutral-950 text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950',
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </button>
  );
}

function GlassBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="veridia-panel p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4" />
        {title}
      </div>
      {children}
    </section>
  );
}

function ActionCard({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className="veridia-tile min-h-[112px] text-left" onClick={onClick}>
      <Icon className="size-5 text-neutral-900" />
      <span className="mt-4 block text-sm font-medium leading-5">{title}</span>
      <span className="mt-1 hidden text-sm leading-5 text-neutral-500 sm:block">{detail}</span>
    </button>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-3 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function ChatGPTBlock({ linked, onConnect }: { linked: boolean; onConnect: () => void }) {
  return (
    <section className="veridia-panel p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-neutral-950 text-white">
          <Cloud className="size-4" />
        </div>
        <div>
          <div className="text-sm font-semibold">{linked ? 'ChatGPT preparado' : 'Conectar ChatGPT'}</div>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            A conta ChatGPT pode entrar via ChatGPT App/MCP OAuth ou Codex App Server. Esta tela ja reserva o ponto de entrada; o token real nao deve ser guardado no navegador.
          </p>
        </div>
      </div>
      <Button variant={linked ? 'outline' : 'default'} className="mt-4 w-full rounded-xl" onClick={onConnect}>
        {linked ? 'Ver contrato de integracao' : 'Preparar conexao'}
        <ArrowRight className="size-4" />
      </Button>
    </section>
  );
}

function EmptyHuman({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 p-6 text-center text-sm leading-6 text-neutral-500">
      {text}
    </div>
  );
}
