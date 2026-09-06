import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDashed,
  Clapperboard,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Play,
  Plus,
  RefreshCcw,
  ScanSearch,
  ShieldAlert,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  getGetProjectReportQueryKey,
  getListProjectsQueryKey,
  useAnalyzeProject,
  useDeleteAsset,
  useCreateProject,
  useGetProjectReport,
  useListProjects,
  useUploadAsset,
} from '@workspace/api-client-react';
import type { Detection, Project, Report } from '@workspace/api-client-react';
import {
  Route,
  Switch,
  Link,
  useParams,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
    : '—';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error;
  }
  return fallback;
};

const getMediaDimensions = (file: File, type: string) =>
  new Promise<{ width: number; height: number }>((resolve) => {
    if (type === 'script') {
      resolve({ width: 0, height: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    if (type === 'image') {
      const image = new Image();
      image.onload = () => {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(url);
      };
      image.src = url;
      return;
    }
    const video = document.createElement('video');
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });

const categoryLabel = (category: string) =>
  ({ celebrity_name: 'Celebrity name', existing_ip: 'Existing IP', brand: 'Brand', logo: 'Logo', song: 'Song' } as Record<string, string>)[category] ?? category;

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isReport = location.startsWith('/report/');
  return (
    <div className="min-h-[100dvh] bg-background text-foreground md:grid md:grid-cols-[238px_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground md:min-h-[100dvh]">
        <div className="flex items-center justify-between px-5 py-5 md:block md:h-full">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="grid size-9 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Clapperboard size={19} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight">RightScan</span>
              <span className="retro-kicker text-sidebar-foreground/75">a production review</span>
            </span>
          </Link>
          <nav className="hidden space-y-1 md:mt-14 md:block">
            <Link href="/" className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${!isReport ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid="link-workspace">
              <ScanSearch size={16} /><span>Clearance workspace</span>
            </Link>
            <Link href={isReport ? location : '/'} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${isReport ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid="link-latest-report">
              <FileText size={16} /><span>Latest report</span>
            </Link>
          </nav>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="px-5 py-7 sm:px-8 sm:py-9 lg:px-12">
      <div className="mx-auto flex max-w-[1380px] flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="retro-kicker text-accent">{eyebrow}</p>
          <h1 className="mt-2 text-[clamp(1.8rem,3vw,2.65rem)] font-semibold tracking-[-0.045em]">{title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
    </header>
  );
}

function ProjectPicker({ projects, selectedId, onSelect, onCreated }: { projects: Project[]; selectedId?: string; onSelect: (id: string) => void; onCreated: (project: Project) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const createProject = useCreateProject();
  const selected = projects.find((project) => project.id === selectedId);
  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || createProject.isPending) return;
    createProject.mutate({ data: { title: cleanTitle } }, {
      onSuccess: (project) => { onCreated(project); setTitle(''); setOpen(false); },
    });
  };
  return (
    <div className="relative space-y-2">
      {selected && (
        <div className="rounded-md bg-sidebar-accent px-3 py-2.5 text-sidebar-accent-foreground" data-testid="current-project">
          <span className="block truncate text-sm font-semibold text-sidebar-accent-foreground">{selected.title}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-sidebar-accent-foreground/75">{selected.assetCount} assets · {selected.detectionCount} findings</span>
        </div>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 rounded-md bg-sidebar-accent/45 px-3 py-2.5 text-left text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent" data-testid="button-project-picker">
        <span className="min-w-0 text-sm font-medium">{selected ? 'Select another project' : 'Select a project'}</span>
        <ChevronDown size={15} className={`shrink-0 text-sidebar-foreground/55 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 isolate rounded-md bg-sidebar p-1.5 shadow-2xl">
          <div className="max-h-56 overflow-auto">
            {projects.map((project) => (
              <button type="button" key={project.id} onClick={() => { onSelect(project.id); setOpen(false); }} className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-sm ${project.id === selectedId ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent'}`} data-testid={`button-project-${project.id}`}>
                <span className="truncate">{project.title}</span>
                <span className="ml-3 font-mono text-[9px] opacity-60">{project.assetCount}</span>
              </button>
            ))}
          </div>
          <div className="mt-1 pt-1">
            {open && !createProject.isPending && (
              <div className="flex gap-1">
                <input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submit()} placeholder="New project title" className="min-w-0 flex-1 rounded bg-sidebar-accent px-2.5 py-2 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/35 focus:ring-1 focus:ring-sidebar-primary" data-testid="input-new-project-title" />
                <button type="button" onClick={submit} disabled={!title.trim()} className="rounded bg-sidebar-primary px-2.5 text-sidebar-primary-foreground disabled:opacity-40" data-testid="button-create-project"><Plus size={15} /></button>
              </div>
            )}
            {createProject.isPending && <div className="flex items-center gap-2 px-2 py-2 text-xs text-sidebar-foreground/55"><LoaderCircle size={13} className="animate-spin" /> Creating project</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function FileGlyph({ type, size = 18 }: { type: string; size?: number }) {
  if (type === 'image') return <ImageIcon size={size} />;
  if (type === 'video') return <Film size={size} />;
  return <FileText size={size} />;
}

function MediaAssetPreview({ asset, onRemove, removing }: { asset: Project['assets'][number]; onRemove: () => void; removing: boolean }) {
  if ((asset.type !== 'image' && asset.type !== 'video') || !asset.previewDataUrl) return null;
  return (
    <div className="relative pt-4">
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        className="absolute right-1 top-0 z-10 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-80 disabled:opacity-50"
        aria-label={`Remove ${asset.filename}`}
        title={`Remove ${asset.filename}`}
        data-testid={`button-remove-asset-${asset.id}`}
      >
        {removing ? <LoaderCircle size={12} className="animate-spin" /> : <X size={13} strokeWidth={2.5} />}
      </button>
      <div className="overflow-hidden rounded-md bg-muted" style={asset.width > 0 && asset.height > 0 ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}>
        {asset.type === 'video' ? (
          <video className="block h-full w-full object-contain" src={asset.previewDataUrl} controls preload="metadata" aria-label={`Preview of ${asset.filename}`} />
        ) : (
          <img className="block h-full w-full object-contain" src={asset.previewDataUrl} alt={`Preview of ${asset.filename}`} />
        )}
      </div>
      <p className="mt-2 truncate text-[11px] text-muted-foreground" title={asset.filename}>{asset.filename}</p>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-amber-100 text-amber-900',
    low: 'bg-emerald-100 text-emerald-900',
  } as Record<string, string>;
  return <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider ${styles[level] ?? 'bg-muted text-muted-foreground'}`} data-testid={`status-risk-${level}`}><span className="status-dot bg-current" />{level}</span>;
}

function Home() {
  const projectsQuery = useListProjects({ query: { queryKey: getListProjectsQueryKey() } });
  const projects = projectsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string>();
  const [uploadError, setUploadError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const selectedProject = projects.find((project) => project.id === selectedId);
  const reportQuery = useGetProjectReport(selectedId ?? '', { query: { enabled: Boolean(selectedId && selectedProject?.reportStatus === 'ready'), queryKey: getGetProjectReportQueryKey(selectedId ?? '') } });
  const uploadAsset = useUploadAsset();
  const deleteAsset = useDeleteAsset();
  const analyzeProject = useAnalyzeProject();

  useEffect(() => {
    if (!selectedId && projects[0]) setSelectedId(projects[0].id);
    if (selectedId && projects.length > 0 && !projects.some((project) => project.id === selectedId)) setSelectedId(projects[0].id);
  }, [projects, selectedId]);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!selectedId || !files.length) return;
    setUploadError('');
    try {
      for (const file of files) {
        const contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(new Error('Unable to read file'));
          reader.readAsDataURL(file);
        });
        const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'script';
        const dimensions = await getMediaDimensions(file, type);
        await uploadAsset.mutateAsync({ projectId: selectedId, data: { filename: file.name, type, mimeType: file.type || 'application/octet-stream', contentBase64, ...dimensions } });
      }
      await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed. Try again.');
    } finally {
      event.target.value = '';
    }
  };

  const runAnalysis = () => {
    if (!selectedId || !selectedProject?.assetCount || analyzeProject.isPending) return;
    setAnalysisError('');
    analyzeProject.mutate({ projectId: selectedId }, {
      onSuccess: (report) => {
        queryClient.setQueryData(getGetProjectReportQueryKey(selectedId), report);
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      },
      onError: (error) => setAnalysisError(getErrorMessage(error, 'Analysis could not be completed. Try again.')),
    });
  };

  if (projectsQuery.isLoading) return <LoadingScreen label="Loading workspace" />;
  if (projectsQuery.isError) return <ErrorScreen message="The project desk could not be loaded." onRetry={() => projectsQuery.refetch()} />;

  return (
    <div className="min-h-[100dvh]">
      <PageHeader eyebrow="RightScan" title="Know what needs a call before you shoot." description="Bring in the script, boards, and references. RightScan surfaces the rights questions worth answering first." />
      <div className="mx-auto max-w-[1380px] px-5 py-6 sm:px-8 lg:px-12">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_355px]">
          <div className="space-y-6">
            <section className="rounded-lg bg-card p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 pb-5 sm:flex-row sm:items-start">
                <div>
                  <p className="retro-kicker text-muted-foreground">Bring in your material</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-tight">Build the review set</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Scripts, reference stills, and cuts are all fair game.</p>
                </div>
                {selectedProject && <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{selectedProject.assetCount} {selectedProject.assetCount === 1 ? 'asset' : 'assets'} in set</span>}
              </div>
              {!selectedProject ? (
                <div className="scan-grid mt-5 rounded-md p-8 text-center sm:p-12">
                  <FolderOpen size={24} className="mx-auto text-muted-foreground" />
                  <h3 className="mt-3 font-medium">Start with a project</h3>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Name the production in the project picker, then drop in the material you want cleared.</p>
                </div>
              ) : (
                <>
                   <label className={`mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-md bg-accent/[0.035] px-5 py-7 text-center transition-colors hover:bg-accent/[0.07] ${uploadAsset.isPending ? 'pointer-events-none opacity-70' : ''}`} data-testid="dropzone-assets">
                    <input type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.txt,.rtf,image/*,video/*" onChange={handleFiles} data-testid="input-assets" />
                    {uploadAsset.isPending ? <LoaderCircle size={24} className="animate-spin text-accent" /> : <UploadCloud size={24} className="text-accent" />}
                    <span className="mt-3 text-sm font-medium">{uploadAsset.isPending ? 'Adding material to the set…' : 'Drop files here or browse'}</span>
                   <span className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT, JPG, PNG, or MP4 · clips under 18 MB</span>
                  </label>
                  {uploadError && <div className="mt-3 flex items-center gap-2 text-xs text-destructive" data-testid="status-upload-error"><AlertTriangle size={14} />{uploadError}</div>}
                   {selectedProject.assets.filter((asset) => asset.type === 'image' || asset.type === 'video').length > 0 && (
                     <div className="mt-5 pt-5">
                       <div className="flex items-center justify-between gap-3">
                         <p className="retro-kicker text-muted-foreground">Stills and cuts in the set</p>
                       </div>
                       <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                         {selectedProject.assets.filter((asset) => asset.type === 'image' || asset.type === 'video').map((asset) => (
                           <MediaAssetPreview
                             key={asset.id}
                             asset={asset}
                             removing={deleteAsset.isPending && deleteAsset.variables?.assetId === asset.id}
                             onRemove={() => {
                               if (!window.confirm(`Remove ${asset.filename} from this review set?`)) return;
                               const projectId = selectedId;
                               if (!projectId) return;
                               deleteAsset.mutate({ projectId, assetId: asset.id }, {
                                 onSuccess: () => {
                                   queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
                                   queryClient.invalidateQueries({ queryKey: getGetProjectReportQueryKey(projectId) });
                                 },
                               });
                             }}
                           />
                         ))}
                       </div>
                     </div>
                   )}
                  <div className="mt-5 space-y-2">
                    {selectedProject.assetCount === 0 ? <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground"><CircleDashed size={17} />Nothing added yet. The first pass starts with source material.</div> : <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground"><Check size={17} className="text-emerald-700" />{selectedProject.assetCount} source {selectedProject.assetCount === 1 ? 'file is' : 'files are'} ready for analysis.</div>}
                  </div>
                </>
              )}
              <div className="mt-8">
                <button type="button" onClick={runAnalysis} disabled={!selectedProject?.assetCount || analyzeProject.isPending} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40" data-testid="button-run-analysis">
                  {analyzeProject.isPending ? <><LoaderCircle size={15} className="animate-spin" /> Analyzing…</> : <><Play size={14} fill="currentColor" /> Run analysis</>}
                </button>
                <div className="mt-5 flex items-center gap-4 rounded-md bg-muted/55 px-4 py-3">
                <div className={`grid size-9 place-items-center rounded-full ${analyzeProject.isPending ? 'bg-accent text-accent-foreground' : selectedProject?.reportStatus === 'ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-secondary text-muted-foreground'}`}>
                  {analyzeProject.isPending ? <Activity size={17} className="animate-pulse" /> : selectedProject?.reportStatus === 'ready' ? <Check size={17} /> : <ScanSearch size={17} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{analyzeProject.isPending ? 'Reading the review set' : selectedProject?.reportStatus === 'ready' ? 'Scan complete' : 'Waiting for a first pass'}</p>
                  {analyzeProject.isPending && <p className="mt-0.5 text-xs text-muted-foreground">This can take a moment. Keep this desk open.</p>}
                  {!analyzeProject.isPending && selectedProject?.reportStatus !== 'ready' && <p className="mt-0.5 text-xs text-muted-foreground">Add at least one asset to enable analysis.</p>}
                </div>
                {analyzeProject.isPending && <div className="h-1 w-16 overflow-hidden rounded bg-accent/20"><div className="pulse-bar h-full origin-left rounded bg-accent" /></div>}
                </div>
                {analysisError && <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-xs leading-relaxed text-destructive" data-testid="status-analysis-error"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{analysisError}</span></div>}
              </div>

            <LatestReport report={reportQuery.data} loading={reportQuery.isLoading} error={reportQuery.isError} project={selectedProject} />
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-lg bg-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{selectedProject ? 'Current project' : 'Select a Project'}</h2>
                </div>
              </div>
              <div className="mt-5"><ProjectPicker projects={projects} selectedId={selectedId} onSelect={setSelectedId} onCreated={(project) => { setSelectedId(project.id); queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() }); }} /></div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function LatestReport({ report, loading, error, project }: { report?: Report; loading: boolean; error: boolean; project?: Project }) {
  return (
    <div className="mt-8">
      <div className="flex items-start justify-between gap-4 pb-5">
        <div><h2 className="text-lg font-semibold tracking-tight">Scan Results</h2></div>
        {report && project && <Link href={`/report/${project.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline" data-testid="link-report-details">View details <ArrowUpRight size={13} /></Link>}
      </div>
      {loading ? <div className="space-y-3 py-5"><div className="h-4 w-1/3 animate-pulse rounded bg-muted" /><div className="h-10 w-full animate-pulse rounded bg-muted" /></div> : error ? <div className="flex items-center gap-2 py-6 text-sm text-destructive"><AlertTriangle size={15} />No saved report is available for this project yet.</div> : !report ? <div className="scan-grid mt-5 rounded-md p-8 text-center"><ShieldAlert size={23} className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm font-medium">The report will land here.</p><p className="mt-1 text-xs text-muted-foreground">Run an analysis after adding source material.</p></div> : <ReportSummary report={report} compact />}
      {project && <div className="mt-6 flex justify-end"><Link href={`/report/${project.id}`} className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90" data-testid="link-open-report">Open saved report <ArrowUpRight size={15} /></Link></div>}
    </div>
  );
}

function ReportSummary({ report, compact = false }: { report: Report; compact?: boolean }) {
  const total = report.counts.low + report.counts.medium + report.counts.high;
  const categoryCounts = report.detections.reduce<Record<string, number>>((counts, detection) => {
    counts[detection.category] = (counts[detection.category] ?? 0) + 1;
    return counts;
  }, {});
  const categoryEntries = Object.entries(categoryCounts).sort(([, a], [, b]) => b - a);
  return (
    <div className="mt-5">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground" data-testid="text-report-summary">{report.summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" data-testid="summary-detection-types">
        <span className="font-medium text-foreground">Detected:</span>
        {categoryEntries.length > 0 ? categoryEntries.map(([category, count]) => <span className="rounded-md bg-muted/65 px-2.5 py-1.5 text-muted-foreground" key={category}>{count} {categoryLabel(category)}{count === 1 ? '' : 's'}</span>) : <span className="text-muted-foreground">No included signals</span>}
      </div>
      <div className={`mt-5 grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-3'}`}>
        {(['high', 'medium', 'low'] as const).map((level) => <div className="rounded-md bg-muted/65 p-3" key={level} data-testid={`stat-${level}-count`}><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{level}</span><span className={`status-dot ${level === 'high' ? 'bg-red-700' : level === 'medium' ? 'bg-amber-600' : 'bg-emerald-700'}`} /></div><p className="mt-2 text-xl font-semibold tracking-tight">{report.counts[level]}</p></div>)}
      </div>
      <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>{total} detected signals</span><span>{report.analyzedAssets} assets analyzed</span></div>
    </div>
  );
}

function ReportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, setLocation] = useLocation();
  const reportQuery = useGetProjectReport(projectId ?? '', { query: { enabled: Boolean(projectId), queryKey: getGetProjectReportQueryKey(projectId ?? '') } });
  const projectsQuery = useListProjects({ query: { queryKey: getListProjectsQueryKey() } });
  const project = projectsQuery.data?.find((item) => item.id === projectId);
  const detections = useMemo(() => reportQuery.data?.detections ?? [], [reportQuery.data?.detections]);
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? detections : detections.filter((detection) => detection.riskLevel === filter);
  return (
    <div className="min-h-[100dvh]">
      <PageHeader eyebrow="RightScan report" title={project?.title ?? 'Clearance report'} description={reportQuery.data ? `Generated ${formatDate(reportQuery.data.generatedAt)} · ${reportQuery.data.analyzedAssets} assets analyzed` : 'A source-linked view of the latest clearance pass.'} action={<button type="button" onClick={() => setLocation('/')} className="inline-flex items-center gap-2 self-start text-sm font-medium text-muted-foreground hover:text-foreground lg:self-auto" data-testid="button-back-workspace"><ArrowLeft size={15} /> Back to workspace</button>} />
      <div className="mx-auto max-w-[1380px] px-5 py-6 sm:px-8 lg:px-12">
        {reportQuery.isLoading ? <LoadingScreen label="Loading report" /> : reportQuery.isError || !reportQuery.data ? <ErrorScreen message="This report is not available yet." onRetry={() => reportQuery.refetch()} backHref="/" /> : (
          <div className="space-y-6">
            <section className="rounded-lg bg-card p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-5 pb-6 lg:flex-row lg:items-start">
                <div className="max-w-2xl"><p className="text-[clamp(1.5rem,3vw,2.5rem)] font-semibold leading-tight tracking-[-0.035em] text-foreground">{reportQuery.data.summary}</p></div>
                <div className="grid grid-cols-3 gap-2 lg:min-w-[305px]">{(['high', 'medium', 'low'] as const).map((level) => <div className="bg-muted/65 px-3 py-3" key={level} data-testid={`report-stat-${level}`}><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{level}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{reportQuery.data.counts[level]}</p></div>)}</div>
              </div>
            </section>
            <section className="rounded-lg bg-card">
              <div className="flex flex-col justify-between gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-7">
                <div><h2 className="text-lg font-semibold tracking-tight">Detailed analysis of potential issues</h2></div>
                <div className="flex items-center gap-1 rounded-md bg-muted p-1">{['all', 'high', 'medium', 'low'].map((value) => <button type="button" key={value} onClick={() => setFilter(value)} className={`rounded px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${filter === value ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`button-filter-${value}`}>{value}</button>)}</div>
              </div>
              {filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No detections in this view.</div> : <div>{filtered.map((detection, index) => <DetectionRow detection={detection} previews={reportQuery.data.previews} index={index} key={detection.id} />)}</div>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function DetectionRow({ detection, previews, index }: { detection: Detection; previews: Report['previews']; index: number }) {
  const [expanded, setExpanded] = useState(index === 0 && detection.riskLevel === 'high');
  const preview = previews.find((item) => item.assetId === detection.assetId);
  return (
    <article className="px-5 py-5 sm:px-7" data-testid={`row-detection-${detection.id}`}>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-4 text-left" data-testid={`button-expand-detection-${detection.id}`}>
        <div className="flex min-w-0 gap-3.5">
          <span className={`mt-1 grid size-8 shrink-0 place-items-center rounded ${detection.riskLevel === 'high' ? 'bg-red-100 text-red-800' : detection.riskLevel === 'medium' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}><ShieldAlert size={15} /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{detection.name}</h3><span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{categoryLabel(detection.category)}</span></div><p className="mt-1 text-xs text-muted-foreground">{detection.sourceRef} · {Math.round(detection.confidence * 100)}% confidence</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-3"><RiskBadge level={detection.riskLevel} /><ChevronDown size={15} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} /></div>
      </button>
      {expanded && <div className="ml-[46px] mt-4 grid gap-5 pl-4 sm:grid-cols-[1.1fr_1fr] fade-up"><div><EvidencePreview detection={detection} preview={preview} /><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Context</p><p className="mt-2 text-sm leading-relaxed text-foreground/80">“{detection.contextSnippet}”</p><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">{detection.prominence && <span>Prominence: {detection.prominence}</span>}{detection.duration && <span>Duration: {detection.duration}</span>}{detection.sentiment && <span>Sentiment: {detection.sentiment}</span>}{detection.narrativeRole && <span>Role: {detection.narrativeRole}</span>}</div>{detection.visualEvidence && <p className="mt-4 text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">Visual evidence:</span> {detection.visualEvidence}</p>}</div><div><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Why it matters</p><p className="mt-2 text-sm leading-relaxed text-foreground/80">{detection.rationale}</p>{detection.frameReference && <p className="mt-4 text-xs text-muted-foreground">Preview anchored to the {detection.frameReference.toLowerCase()}.</p>}</div></div>}
    </article>
  );
}

function EvidencePreview({ detection, preview }: { detection: Detection; preview?: Report['previews'][number] }) {
  if (!preview) return null;
  const box = detection.boundingBox;
  const hasBox = Boolean(box && preview.width > 0 && preview.height > 0);
  const style = hasBox && box ? {
    left: `${(box.left / preview.width) * 100}%`,
    top: `${(box.top / preview.height) * 100}%`,
    width: `${((box.right - box.left) / preview.width) * 100}%`,
    height: `${((box.bottom - box.top) / preview.height) * 100}%`,
  } : undefined;
  return (
    <div className="mb-5">
      <p className="retro-kicker mb-2 text-muted-foreground">Source preview</p>
      <div className="relative max-w-[460px] overflow-hidden rounded-md bg-primary/10" style={preview.width > 0 && preview.height > 0 ? { aspectRatio: `${preview.width} / ${preview.height}` } : undefined}>
        {preview.type === 'video' ? <video className="block h-full w-full object-contain" src={preview.dataUrl} controls preload="metadata" aria-label={`Preview of ${preview.filename}`} /> : <img className="block h-full w-full object-contain" src={preview.dataUrl} alt={`Preview of ${preview.filename}`} />}
        {style && <span aria-label={`Bounding box for ${detection.name}`} className="pointer-events-none absolute border border-emerald-500" style={style}><span className="absolute -top-5 left-[-1px] whitespace-nowrap bg-emerald-600 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">{detection.name}</span></span>}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{preview.filename}{preview.type === 'video' ? ' · first detected sequence' : ' · detected frame'}</p>
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <div className="flex min-h-[40vh] items-center justify-center"><div className="text-center"><LoaderCircle size={22} className="mx-auto animate-spin text-accent" /><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground" data-testid="status-loading">{label}</p></div></div>;
}

function ErrorScreen({ message, onRetry, backHref }: { message: string; onRetry: () => void; backHref?: string }) {
  return <div className="flex min-h-[55vh] items-center justify-center px-5"><div className="max-w-sm text-center"><div className="mx-auto grid size-10 place-items-center rounded-full bg-red-100 text-red-800"><AlertTriangle size={19} /></div><h2 className="mt-4 text-lg font-semibold">Something interrupted the desk.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground" data-testid="status-error">{message}</p><div className="mt-5 flex items-center justify-center gap-2"><button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground" data-testid="button-retry"><RefreshCcw size={14} /> Try again</button>{backHref && <Link href={backHref} className="rounded-md px-3.5 py-2 text-sm font-medium" data-testid="link-error-back">Back</Link>}</div></div></div>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/report/:projectId" component={ReportPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Shell><Router /></Shell></WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
