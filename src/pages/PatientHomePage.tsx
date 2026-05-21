import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  HeartPulse,
  History,
  Home,
  Leaf,
  LockKeyhole,
  MessageCircle,
  Moon,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
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

const fallbackDocuments = [
  { title: 'Exames de sangue', meta: '12 mai • PDF' },
  { title: 'Consulta - Cardiologia', meta: '8 mai • PDF' },
  { title: 'Receita medica', meta: '2 mai • PDF' },
  { title: 'Raio-X - Torax', meta: '30 abr • PDF' },
];

const fallbackPlan = [
  'Meditacao 10 min',
  'Caminhada 30 min',
  'Dormir antes das 23h',
  'Hidratacao',
  'Alimentacao equilibrada',
];

const getFileTone = (item: VaultObject) => {
  if (item.status === 'indexed') return 'Resumo pronto';
  if (item.status === 'failed') return 'Precisa de atencao';
  if (item.status === 'processing' || item.status === 'queued') return 'Preparando';
  return 'Guardado';
};

function LeafMark() {
  return (
    <div className="relative size-7">
      <div className="absolute left-1 top-1 h-6 w-3 rounded-full bg-gradient-to-b from-emerald-600 to-sky-400 [clip-path:polygon(50%_0,100%_18%,72%_100%,50%_78%,28%_100%,0_18%)]" />
      <div className="absolute left-3 top-1 h-6 w-3 rounded-full bg-gradient-to-b from-sky-500 to-emerald-500 opacity-80 [clip-path:polygon(50%_0,100%_18%,72%_100%,50%_78%,28%_100%,0_18%)]" />
    </div>
  );
}

export function PatientHomePage() {
  const [patientId] = useState(() => localStorage.getItem('veridia_patient_id') || DEFAULT_PATIENT_ID);
  const [active, setActive] = useState<PatientSection>('today');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [vault, setVault] = useState<VaultObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('Estou aqui. Conte em uma frase o que voce quer cuidar agora.');
  const [journal, setJournal] = useState('');
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
      toast.error(error instanceof Error ? error.message : 'Nao consegui carregar seu espaco Veridia');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    localStorage.setItem('veridia_patient_id', patientId);
    loadPatientSpace();
  }, [loadPatientSpace, patientId]);

  const uploadFile = async (file: File) => {
    setBusy(true);
    try {
      const contentBase64 = await readFileAsBase64(file);
      await cellApi.uploadVaultObject(patientId, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
      });
      toast.success('Documento guardado. Vou preparar um resumo.');
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
      if (!result.success || streamed.toLowerCase().includes('temporary issue')) {
        setReply('Tive uma instabilidade no motor de resposta, mas posso organizar isso: quando comecou, frequencia, intensidade, o que melhora ou piora, remedios em uso e sinais de alerta para discutir com um profissional.');
      }
      await cellApi.createTimelineEvent(patientId, {
        type: 'note',
        title: 'Conversa com Veridia',
        summary: clean,
        sourceType: 'chat',
      }).catch(() => undefined);
      await loadPatientSpace();
    } catch {
      setReply('Tive uma falha agora, mas seu pedido ficou claro. Tente novamente em instantes.');
    } finally {
      setBusy(false);
    }
  };

  const saveJournal = async () => {
    if (!journal.trim()) return;
    setBusy(true);
    try {
      await cellApi.checkIn(patientId, { mood: 8, sleepHours: 7.25, stress: 3, note: journal.trim() });
      setJournal('');
      toast.success('Check-in salvo na sua jornada.');
      await loadPatientSpace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao consegui salvar seu check-in');
    } finally {
      setBusy(false);
    }
  };

  const displayName = summary?.patient.displayName && summary.patient.displayName !== 'Demo Patient'
    ? summary.patient.displayName.split(' ')[0]
    : 'Gustavo';
  const weeklyPlan = summary?.therapy.weeklyPlan?.length ? summary.therapy.weeklyPlan : fallbackPlan;
  const recentDocs = vault.length ? vault.slice(0, 4) : fallbackDocuments;

  const renderToday = () => (
    <section className="veridia-main-grid">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="veridia-display text-4xl leading-none text-neutral-950 sm:text-5xl">Bom dia, {displayName}</h1>
            <p className="mt-3 text-sm text-neutral-500">Seu bem-estar e unico. Seu cuidado tambem.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10 rounded-xl border-neutral-200 bg-white px-4 text-xs" onClick={() => toast.info('Conexao ChatGPT preparada para a fase OAuth/MCP.')}>
              <Sparkles className="size-4" />
              Conectar ChatGPT
            </Button>
            <Button variant="outline" size="icon" className="size-10 rounded-full border-neutral-200 bg-white" onClick={loadPatientSpace}>
              <User className="size-4" />
            </Button>
          </div>
        </div>

        <div className="veridia-hero-card">
          <div className="pointer-events-none absolute right-0 top-0 h-40 w-56 rounded-bl-[8rem] bg-[radial-gradient(circle_at_center,rgba(84,119,79,0.18),transparent_68%)]" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-36 w-72 bg-[radial-gradient(circle_at_center,rgba(81,139,190,0.12),transparent_68%)]" />
          <div className="relative mx-auto max-w-2xl text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-white/70 shadow-sm">
              <LeafMark />
            </div>
            <h2 className="veridia-display mt-8 text-4xl leading-[1.05] text-neutral-950 sm:text-5xl">O que voce quer cuidar agora?</h2>
            <div className="mx-auto mt-7 max-w-xl rounded-2xl border border-neutral-200 bg-white/90 p-2 shadow-lg shadow-neutral-950/[0.06]">
              <div className="flex items-center gap-2">
                <Input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') sendCompanionMessage();
                  }}
                  placeholder="Fale com a Veridia..."
                  className="h-12 flex-1 border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
                />
                <Button size="icon" variant="outline" className="size-10 rounded-full border-neutral-200 bg-white text-neutral-500" onClick={() => sendCompanionMessage()} disabled={busy || !message.trim()}>
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
            <p className="mt-4 text-xs text-neutral-400">Veridia pode errar. Sempre confirme com seu profissional de saude.</p>
          </div>
        </div>

        <section className="veridia-plan-card">
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3 text-sm font-medium text-emerald-700">
                <HeartPulse className="size-4" />
                Plano ativo
              </div>
              <h3 className="veridia-display mt-4 text-2xl">Equilibrio e energia</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">Sono, alimentacao e movimento para mais disposicao no dia a dia.</p>
              <div className="mt-5 grid gap-2 text-sm text-neutral-600 sm:grid-cols-2">
                <span className="flex items-center gap-2"><Clock3 className="size-4" />3 habitos em progresso</span>
                <span className="flex items-center gap-2"><CalendarDays className="size-4" />Proxima revisao em 7 dias</span>
              </div>
            </div>
            <Button variant="outline" className="h-10 rounded-xl bg-white" onClick={() => setActive('journey')}>Ver plano</Button>
          </div>
        </section>

        <section className="veridia-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Documentos recentes</h3>
            <button className="text-xs font-medium text-emerald-700" onClick={() => setActive('files')}>Ver todos</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recentDocs.map((item) => {
              const title = 'filename' in item ? item.filename : item.title;
              const meta = 'filename' in item ? getFileTone(item) : item.meta;
              return (
                <button key={title} className="rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:border-emerald-600" onClick={() => setActive('files')}>
                  <FileText className="size-5 text-neutral-700" />
                  <div className="mt-3 truncate text-xs font-medium">{title}</div>
                  <div className="mt-1 text-[11px] text-neutral-400">{meta}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="veridia-panel p-4">
          <h3 className="text-sm font-semibold">Proximos passos</h3>
          <div className="mt-4 flex flex-col gap-2">
            <NextStep number="1" title="Check-in rapido" detail="Como voce tem se sentido nas ultimas 24 horas?" onClick={() => setActive('journey')} />
            <NextStep number="2" title="Enviar novos documentos" detail="Compartilhe exames, receitas ou relatorios." onClick={() => fileInputRef.current?.click()} />
          </div>
        </section>

        <div className="rounded-2xl border border-neutral-200 bg-white/60 p-4 text-sm text-neutral-500">
          <LockKeyhole className="mr-2 inline size-4" />
          Sua privacidade importa. Seus dados sao protegidos e nunca compartilhados sem permissao.
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="veridia-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Seu estado hoje</h3>
            <ShieldCheck className="size-4 text-neutral-400" />
          </div>
          <div className="flex flex-col gap-3">
            <StateRow label="Humor" value={summary?.therapy.lastCheckin?.mood ? `${summary.therapy.lastCheckin.mood}/10` : 'Calmo'} subvalue={summary?.therapy.lastCheckin?.mood ? 'registrado' : '8/10'} icon="smile" />
            <StateRow label="Sono" value={summary?.therapy.lastCheckin?.sleepHours ? `${summary.therapy.lastCheckin.sleepHours}h` : '7h 15min'} subvalue="Bom" icon="moon" />
            <StateRow label="Estresse" value={summary?.therapy.lastCheckin?.stress ? `${summary.therapy.lastCheckin.stress}/10` : 'Baixo'} subvalue={summary?.therapy.lastCheckin?.stress ? 'registrado' : '3/10'} icon="leaf" />
          </div>
        </section>

        <section className="veridia-panel p-4">
          <h3 className="text-sm font-semibold">Plano da semana</h3>
          <p className="mt-1 text-xs text-neutral-500">2 de 5 concluidas</p>
          <Progress value={40} className="my-4 h-2" />
          <div className="flex flex-col gap-3">
            {weeklyPlan.slice(0, 5).map((step, index) => (
              <div key={step} className="flex items-start gap-3">
                <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', index < 2 ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-neutral-300 text-transparent')}>
                  <Check className="size-3" />
                </span>
                <div>
                  <div className="text-sm leading-4">{step}</div>
                  <div className="mt-1 text-[11px] text-neutral-400">Todos os dias</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="veridia-quote">
          <p className="veridia-display text-xl italic leading-8">Pequenas escolhas diarias criam grandes transformacoes.</p>
          <p className="mt-6 text-xs text-neutral-500">Veridia</p>
        </section>
      </aside>
    </section>
  );

  const renderTalk = () => (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="veridia-panel p-6 sm:p-8">
        <p className="text-sm text-neutral-500">Conversa cuidadosa</p>
        <h1 className="veridia-display mt-3 text-4xl leading-tight">O que voce quer cuidar agora?</h1>
        <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Escreva aqui: sintomas, medos, duvidas, exames ou algo que voce precisa organizar..."
            className="min-h-32 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
            <span className="text-xs text-neutral-500">Ajuda a organizar e preparar.</span>
            <Button className="rounded-xl" onClick={() => sendCompanionMessage()} disabled={busy || !message.trim()}>
              Enviar
              <Send className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mt-5 rounded-2xl bg-neutral-950 p-5 text-white">
          <div className="text-sm text-neutral-300">Veridia</div>
          <p className="mt-4 whitespace-pre-wrap text-base leading-7">{reply || 'Pensando com cuidado...'}</p>
        </div>
      </div>
      <section className="veridia-panel p-4">
        <h3 className="text-sm font-semibold">Atalhos humanos</h3>
        <div className="mt-4 flex flex-col gap-2">
          {['Entender um sintoma', 'Preparar consulta', 'Ler exame', 'Desabafar'].map((item) => (
            <button key={item} className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm" onClick={() => setMessage(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>
    </section>
  );

  const renderFiles = () => (
    <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="veridia-panel p-6">
        <Upload className="size-8 text-emerald-700" />
        <h1 className="veridia-display mt-6 text-3xl">Guardar documento</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">Exames, PDFs, imagens e anotacoes entram no seu cofre de saude.</p>
        <button className="mt-6 flex w-full flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-8 text-center" onClick={() => fileInputRef.current?.click()}>
          <FileText className="size-8 text-neutral-500" />
          <span className="mt-4 text-sm font-medium">Selecionar arquivo</span>
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {vault.length === 0 && <EmptyHuman text="Nenhum documento ainda. Quando voce guardar algo, ele aparece aqui." />}
        {vault.map((item) => (
          <div key={item.id} className="veridia-row">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{item.filename}</div>
              <div className="mt-1 text-sm text-neutral-500">{item.summary || getFileTone(item)}</div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">{getFileTone(item)}</span>
          </div>
        ))}
      </div>
    </section>
  );

  const renderJourney = () => (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="veridia-panel p-6">
        <h1 className="veridia-display text-3xl">Sua jornada organizada</h1>
        <div className="mt-8 flex flex-col gap-5">
          {timeline.length === 0 && <EmptyHuman text="Conversas, check-ins e documentos importantes vao aparecer aqui." />}
          {timeline.map((item) => (
            <article key={item.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="text-sm font-medium">{item.title}</div>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{item.summary}</p>
              <div className="mt-3 text-xs text-neutral-400">{new Date(item.occurredAt).toLocaleDateString()}</div>
            </article>
          ))}
        </div>
      </div>
      <section className="veridia-panel p-5">
        <h3 className="text-sm font-semibold">Check-in rapido</h3>
        <Textarea value={journal} onChange={(event) => setJournal(event.target.value)} placeholder="Como voce esta hoje?" className="mt-4 min-h-32 resize-none rounded-2xl" />
        <Button className="mt-3 w-full rounded-xl" onClick={saveJournal} disabled={busy || !journal.trim()}>
          Salvar na jornada
        </Button>
      </section>
    </section>
  );

  const currentView = active === 'talk' ? renderTalk() : active === 'files' ? renderFiles() : active === 'journey' ? renderJourney() : renderToday();

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
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px]">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-neutral-200 bg-white/70 p-5 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <LeafMark />
            <div className="veridia-display text-2xl leading-none">Veridia</div>
          </div>
          <nav className="mt-9 flex flex-col gap-2">
            {navItems.map((item) => (
              <NavButton key={item.id} item={item} selected={active === item.id} onClick={() => setActive(item.id)} />
            ))}
          </nav>
          <div className="mt-auto overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="h-20 rounded-xl bg-[radial-gradient(circle_at_20%_20%,rgba(62,142,96,0.24),transparent_34%),linear-gradient(135deg,#f8fbf8,#edf6f1)]" />
            <div className="mt-4 text-sm font-medium">Veridia cuida com voce.</div>
            <p className="mt-2 text-xs leading-5 text-neutral-500">Privado, seguro e feito para a sua saude.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-5 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3 lg:hidden">
            <div className="flex items-center gap-3">
              <LeafMark />
              <div>
                <div className="veridia-display text-xl leading-none">Veridia</div>
                <div className="text-xs text-neutral-500">Hoje</div>
              </div>
            </div>
            <Button variant="outline" size="icon" className="rounded-xl" onClick={loadPatientSpace}>
              <RefreshCcw className="size-4" />
            </Button>
          </header>
          <div className={cn(loading && 'pointer-events-none opacity-70')}>{currentView}</div>
        </main>
      </div>

      <nav className="mx-3 mb-3 grid grid-cols-5 rounded-3xl border border-neutral-200 bg-white/95 p-1 shadow-lg shadow-neutral-950/10 backdrop-blur-xl lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const selected = active === item.id;
          return (
            <button key={item.id} onClick={() => setActive(item.id)} className={cn('flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition', selected ? 'text-emerald-700' : 'text-neutral-500')}>
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
        <button className="flex h-14 flex-col items-center justify-center gap-1 rounded-full text-neutral-950" onClick={() => fileInputRef.current?.click()}>
          <Plus className="size-5" />
        </button>
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
      className={cn('flex h-12 items-center gap-3 rounded-xl px-4 text-sm transition', selected ? 'border border-neutral-200 bg-white text-emerald-700 shadow-sm' : 'text-neutral-700 hover:bg-white/80')}
    >
      <Icon className="size-4" />
      {item.label}
    </button>
  );
}

function StateRow({ label, value, subvalue, icon }: { label: string; value: string; subvalue: string; icon: 'smile' | 'moon' | 'leaf' }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3">
      <div>
        <div className="text-xs font-medium">{label}</div>
        <div className="mt-1 text-sm font-medium text-emerald-700">{value}</div>
        <div className="text-[11px] text-neutral-400">{subvalue}</div>
      </div>
      <div className={cn('flex size-10 items-center justify-center rounded-full', icon === 'moon' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-50 text-emerald-700')}>
        {icon === 'moon' ? <Moon className="size-5" /> : icon === 'leaf' ? <Leaf className="size-5" /> : <HeartPulse className="size-5" />}
      </div>
    </div>
  );
}

function NextStep({ number, title, detail, onClick }: { number: string; title: string; detail: string; onClick: () => void }) {
  return (
    <button className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:border-emerald-600" onClick={onClick}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-medium text-emerald-700">{number}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block truncate text-xs text-neutral-500">{detail}</span>
      </span>
      <ChevronRight className="size-4 text-neutral-400" />
    </button>
  );
}

function EmptyHuman({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 p-6 text-center text-sm leading-6 text-neutral-500">{text}</div>;
}
