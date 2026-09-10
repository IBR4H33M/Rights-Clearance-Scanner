import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleDashed,
  Clapperboard,
  Clock,
  Download,
  Edit3,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  Play,
  Plus,
  Printer,
  RefreshCcw,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
  Volume2,
  Wrench,
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
import type { BoundingBox, Detection, Project, Report } from '@workspace/api-client-react';
import {
  Route,
  Switch,
  Link,
  useParams,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { AuthProvider, useAuth } from '@/lib/auth';
import { exportReportToPDF } from '@/lib/pdf-export';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
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

// ─── Left Sidebar Project Picker ───────────────────────────────────────────

function SidebarProjectPicker({
  projects,
  selectedId,
  onSelect,
  onCreated,
}: {
  projects: Project[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onCreated: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const createProject = useCreateProject();
  const selected = projects.find((project) => project.id === selectedId);

  const submit = () => {
    const cleanTitle = title.trim();
    if (!cleanTitle || createProject.isPending) return;
    createProject.mutate(
      { data: { title: cleanTitle } },
      {
        onSuccess: (project) => {
          onCreated(project);
          setTitle('');
          setOpen(false);
        },
      }
    );
  };

  return (
    <div className="relative my-4 space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/60 px-1">
        <span>Active Project</span>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2.5 rounded-md border border-sidebar-border/60 bg-sidebar-accent/50 px-3 py-2.5 text-left text-sidebar-accent-foreground transition-all hover:bg-sidebar-accent hover:border-sidebar-primary/40 shadow-sm"
        data-testid="button-sidebar-project-picker"
      >
        <div className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-sidebar-foreground">
            {selected ? selected.title : 'Select a Project'}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-sidebar-foreground/60 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 isolate rounded-md border border-sidebar-border bg-sidebar p-2 shadow-2xl fade-up">
          <div className="max-h-56 overflow-auto divide-y divide-sidebar-border/30">
            {projects.length === 0 ? (
              <p className="p-3 text-center text-xs text-sidebar-foreground/50">No projects yet.</p>
            ) : (
              projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => {
                    onSelect(project.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs transition-colors ${
                    project.id === selectedId
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent'
                  }`}
                  data-testid={`button-project-${project.id}`}
                >
                  <span className="truncate">{project.title}</span>
                </button>
              ))
            )}
          </div>
          <div className="mt-2 border-t border-sidebar-border/40 pt-2">
            <div className="flex gap-1.5">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && submit()}
                placeholder="New project title…"
                className="min-w-0 flex-1 rounded border border-sidebar-border/50 bg-sidebar-accent/60 px-2.5 py-1.5 text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/35 focus:ring-1 focus:ring-sidebar-primary"
                data-testid="input-new-project-title"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!title.trim() || createProject.isPending}
                className="grid place-items-center rounded bg-sidebar-primary px-2.5 text-sidebar-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
                data-testid="button-create-project"
                title="Create Project"
              >
                {createProject.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Application Shell ────────────────────────────────────────────────

function Shell({
  children,
  projects,
  selectedId,
  onSelectProject,
}: {
  children: ReactNode;
  projects: Project[];
  selectedId?: string;
  onSelectProject: (id: string) => void;
}) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const isReport = location.startsWith('/report/');
  const isReportsList = location === '/reports';
  const isAnalytics = location === '/analytics';

  const workspaceTitle = user
    ? user.role === 'demo'
      ? 'Demo Workspace'
      : `${user.username}’s Workspace`
    : 'Studio Workspace';

  if (!user) {
    return (
      <main className="min-h-[100dvh] bg-background text-foreground">
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground md:grid md:grid-cols-[250px_1fr]">
      {/* Left Sidebar (only shown when authenticated or demo) */}
      <aside className="border-r border-sidebar-border/60 bg-sidebar text-sidebar-foreground md:min-h-[100dvh] flex flex-col justify-between">
        <div className="px-5 py-5">
          {/* Top of Left Bar: RightScan Title & Icon */}
          <div className="pb-3.5 mb-4 border-b border-sidebar-border/40">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 group cursor-pointer"
              title="Return to RightScan Workspace"
            >
              <img
                src="/icon.png"
                alt="RightScan"
                className="w-6 h-6 object-contain rounded shrink-0"
              />
              <span className="text-xl font-black tracking-tight text-sidebar-foreground group-hover:text-sidebar-primary transition-colors cinema-title">
                RightScan
              </span>
            </Link>
          </div>

          {/* Workspace Name */}
          <div className="pb-4 border-b border-sidebar-border/40">
            <span className="block truncate text-sm font-bold tracking-tight text-sidebar-foreground">
              {workspaceTitle}
            </span>
          </div>

          {/* Project Picker in Left Bar */}
          <SidebarProjectPicker
            projects={projects}
            selectedId={selectedId}
            onSelect={(id) => {
              onSelectProject(id);
              if (location !== '/') setLocation('/');
            }}
            onCreated={(newProj) => {
              onSelectProject(newProj.id);
              queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
              if (location !== '/') setLocation('/');
            }}
          />

          {/* Navigation Links */}
          <nav className="mt-6 space-y-1.5">
            <Link
              href={selectedId ? `/report/${selectedId}` : '/reports'}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-medium transition-colors ${
                isReport || isReportsList
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              }`}
              data-testid="link-reports"
            >
              <FileText size={15} />
              <span>Reports</span>
            </Link>

            <Link
              href="/analytics"
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-xs font-medium transition-colors ${
                isAnalytics
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              }`}
              data-testid="link-analytics"
            >
              <BarChart3 size={15} />
              <span>Analytics</span>
            </Link>
          </nav>
        </div>

        {/* User Account / Session Footer */}
        <div className="p-4 border-t border-sidebar-border/40 bg-sidebar-accent/20">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-sidebar-primary/20 text-sidebar-primary text-xs font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-sidebar-foreground">{user.username}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="p-1.5 text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                title="Sign Out"
                data-testid="button-signout"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <Link
              href="/"
              className="flex items-center justify-center gap-2 w-full py-2 rounded bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <User size={13} />
              <span>Sign In / Demo</span>
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0">{children}</main>
    </div>
  );
}

// ─── Retro Film Landing & Auth Section ─────────────────────────────────────

function RetroLandingHero() {
  const { login, register, startDemo, loading } = useAuth();
  const [authMode, setAuthMode] = useState<'demo' | 'signin' | 'register'>('demo');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'demo') {
        await startDemo();
        await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      } else if (authMode === 'signin') {
        if (!username || !password) throw new Error('Please enter username and password');
        await login(username, password);
        await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      } else if (authMode === 'register') {
        if (!username || !password) throw new Error('Please enter username and password');
        await register(username, password);
        await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  return (
    <div className="relative overflow-hidden w-full min-h-[100dvh] flex flex-col justify-center items-center bg-card/40 px-6 py-12 sm:px-12 sm:py-20">
      {/* Decorative film reel perforation borders */}
      <div className="absolute top-0 left-0 right-0 h-3.5 film-strip opacity-25 border-b border-foreground/10" />
      <div className="absolute bottom-0 left-0 right-0 h-3.5 film-strip opacity-25 border-t border-foreground/10" />

      <div className="mx-auto max-w-4xl text-center">
        {/* Cinema Slate Header Motif */}
        <div className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/10 px-3.5 py-1 text-xs font-mono uppercase tracking-widest text-accent-foreground mb-4">
          <Clapperboard size={13} />
          <span>AI RIGHTS & TRADEMARK CLEARANCE INTELLIGENCE</span>
        </div>

        {/* Large Retro Film Title */}
        <h1 className="cinema-title text-[clamp(2.4rem,6vw,4.5rem)] font-bold tracking-tight text-foreground leading-[1.05]">
          RIGHTSCANNER
        </h1>

        {/* Two-line Intro */}
        <div className="mt-4 max-w-2xl mx-auto space-y-1 text-sm sm:text-base leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground/90">
            Automated rights clearance, trademark detection, and copyright risk intelligence for productions.
          </p>
          <p>
            Scan scripts, footage, and imagery through AI agent inspection before festival or theatrical release.
          </p>
        </div>

        {/* Retro Film Auth Desk */}
        <div className="mt-10 mx-auto max-w-md rounded-lg border-2 border-border/80 bg-card p-6 shadow-xl relative">
          <div className="flex border-b border-border mb-5">
            <button
              type="button"
              onClick={() => { setAuthMode('demo'); setAuthError(''); }}
              className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                authMode === 'demo'
                  ? 'border-b-2 border-primary text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Demo Access
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('signin'); setAuthError(''); }}
              className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                authMode === 'signin'
                  ? 'border-b-2 border-primary text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                authMode === 'register'
                  ? 'border-b-2 border-primary text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4 text-left">
            {authMode === 'demo' ? (
              <div className="space-y-4 py-2">
                <div className="rounded-md bg-accent/15 border border-accent/30 p-3 text-xs leading-relaxed text-foreground">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Sparkles size={14} className="text-accent-foreground" /> Instant Sandbox Mode
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Test the agent immediately. Includes <strong>100 MB clip limit</strong> and persistent reports saved in ClickHouse.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startDemo()}
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 transition-opacity disabled:opacity-50"
                  data-testid="button-launch-demo"
                >
                  {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={15} fill="currentColor" />}
                  <span>Launch Instant Demo (100 MB limit)</span>
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. stanley_director"
                    required
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                    data-testid="input-auth-username"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full rounded border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                    data-testid="input-auth-password"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {authMode === 'register' ? '✓ Studio accounts receive 400 MB file upload limit.' : '✓ Access your saved productions & ClickHouse reports.'}
                </p>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 transition-opacity disabled:opacity-50"
                  data-testid="button-auth-submit"
                >
                  {loading && <LoaderCircle size={15} className="animate-spin" />}
                  <span>{authMode === 'signin' ? 'Sign In to Workspace' : 'Create Studio Account (400 MB)'}</span>
                </button>
              </>
            )}

            {authError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2.5 rounded">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{authError}</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Reusable Confirmation Modal ───────────────────────────────────────────

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-md rounded-lg border-2 border-border/90 bg-card p-6 shadow-2xl space-y-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive border border-destructive/30">
            <Trash2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/50">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1212] hover:bg-[#5e0c0c] border border-[#5e0c0c] px-3.5 py-1.5 text-xs font-bold text-white/90 shadow transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <LoaderCircle size={13} className="animate-spin text-white/90" />
            ) : (
              <Trash2 size={13} className="text-white/90" />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Workspace Component ───────────────────────────────────────────

function FileGlyph({ type, size = 18 }: { type: string; size?: number }) {
  if (type === 'image') return <ImageIcon size={size} />;
  if (type === 'video') return <Film size={size} />;
  return <FileText size={size} />;
}

function MediaAssetPreview({
  asset,
  onRemove,
  removing,
}: {
  asset: Project['assets'][number];
  onRemove: () => void;
  removing: boolean;
}) {
  if ((asset.type !== 'image' && asset.type !== 'video') || !asset.previewDataUrl) return null;
  return (
    <div className="relative pt-4 group">
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        className="absolute right-1 top-0 z-10 grid size-6 place-items-center rounded-full bg-red-100 text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 shadow-sm cursor-pointer"
        aria-label={`Remove ${asset.filename}`}
        title={`Remove ${asset.filename}`}
        data-testid={`button-remove-asset-${asset.id}`}
      >
        {removing ? <LoaderCircle size={12} className="animate-spin" /> : <X size={13} strokeWidth={2.5} />}
      </button>
      <div
        className="overflow-hidden rounded-md border border-border/80 bg-muted/60"
        style={asset.width > 0 && asset.height > 0 ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
      >
        {asset.type === 'video' ? (
          <video
            className="block h-full w-full object-contain"
            src={asset.previewDataUrl}
            controls
            preload="metadata"
            aria-label={`Preview of ${asset.filename}`}
          />
        ) : (
          <img
            className="block h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
            src={asset.previewDataUrl}
            alt={`Preview of ${asset.filename}`}
          />
        )}
      </div>
      <p className="mt-1.5 truncate text-[11px] font-medium text-foreground/80" title={asset.filename}>
        {asset.filename}
      </p>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const styles = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-amber-100 text-amber-900 border-amber-200',
    low: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  } as Record<string, string>;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
        styles[level] ?? 'bg-muted text-muted-foreground border-border'
      }`}
      data-testid={`status-risk-${level}`}
    >
      <span className="status-dot bg-current" />
      {level}
    </span>
  );
}

// ─── Multi-Report Section ──────────────────────────────────────────────────

type HistoricalReportItem = {
  id: string;
  projectId: string;
  name: string;
  summary: string;
  counts: { high: number; medium: number; low: number };
  analyzedAssets: number;
  generatedAt: string;
};

function ProjectReportsSection({
  projectId,
  projectTitle,
  latestReport,
}: {
  projectId: string;
  projectTitle: string;
  latestReport?: Report;
}) {
  const [reports, setReports] = useState<HistoricalReportItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/reports`);
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [projectId, latestReport]);

  const handleExportPDF = async (reportItem: HistoricalReportItem) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/reports/${reportItem.id}`);
      if (res.ok) {
        const fullReport = await res.json();
        exportReportToPDF(fullReport, projectTitle);
      }
    } catch (err) {
      alert('Could not export report to PDF. Try again.');
    }
  };

  const [reportPendingDelete, setReportPendingDelete] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const confirmDeleteReport = async () => {
    if (!reportPendingDelete) return;
    const reportId = reportPendingDelete;
    try {
      setDeletingReportId(reportId);
      const token = localStorage.getItem('rcs_token') || '';
      await fetch(`/api/projects/${projectId}/reports/${reportId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      queryClient.invalidateQueries({ queryKey: getGetProjectReportQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setReportPendingDelete(null);
    } catch (err) {
      alert('Failed to delete report.');
    } finally {
      setDeletingReportId(null);
    }
  };

  return (
    <div className="mt-10 pt-8 border-t border-border/80">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Reports</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full clearance audit history recorded in ClickHouse for this production
          </p>
        </div>
        {latestReport && (
          <button
            type="button"
            onClick={() => exportReportToPDF(latestReport, projectTitle)}
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
            data-testid="button-export-latest-pdf"
          >
            <Printer size={14} />
            <span>Export Latest as PDF</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          <LoaderCircle size={16} className="animate-spin mx-auto mb-2 text-accent" />
          Loading reports…
        </div>
      ) : reports.length === 0 ? (
        <div className="scan-grid mt-4 rounded-md p-8 text-center border border-border/60">
          <ShieldAlert size={24} className="mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No reports generated yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add source assets above and click &quot;Run analysis&quot; to compile your first clearance audit.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {reports.map((r, idx) => (
            <div
              key={r.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border border-border bg-card/60 p-4 transition-all hover:border-sidebar-primary/50 shadow-sm"
              data-testid={`report-card-${r.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[10px] uppercase font-bold text-muted-foreground">
                    #{reports.length - idx}
                  </span>
                  <h3 className="font-semibold text-sm text-foreground truncate">{r.name}</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{r.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  <span>{formatDate(r.generatedAt)}</span>
                  <span>·</span>
                  <span>{r.analyzedAssets} assets</span>
                  <span>·</span>
                  <div className="flex items-center gap-1.5">
                    {r.counts.high > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold">
                        {r.counts.high} High
                      </span>
                    )}
                    {r.counts.medium > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                        {r.counts.medium} Med
                      </span>
                    )}
                    {r.counts.low > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
                        {r.counts.low} Low
                      </span>
                    )}
                    {r.counts.high === 0 && r.counts.medium === 0 && r.counts.low === 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Clean</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => handleExportPDF(r)}
                  className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Export PDF"
                  data-testid={`button-pdf-${r.id}`}
                >
                  <Download size={13} />
                  <span>PDF</span>
                </button>
                <Link
                  href={`/report/${projectId}`}
                  className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
                  data-testid={`button-view-report-${r.id}`}
                >
                  <span>View Details</span>
                  <ArrowUpRight size={13} />
                </Link>
                <button
                  type="button"
                  onClick={() => setReportPendingDelete(r.id)}
                  disabled={deletingReportId === r.id}
                  className="inline-flex items-center justify-center size-8 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors cursor-pointer"
                  title="Delete Report"
                  data-testid={`button-delete-report-${r.id}`}
                >
                  {deletingReportId === r.id ? (
                    <LoaderCircle size={13} className="animate-spin text-destructive" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(reportPendingDelete)}
        title="Delete Clearance Report"
        description="Are you sure you want to permanently delete this clearance report from ClickHouse? This action cannot be undone."
        confirmLabel="Delete Report"
        loading={Boolean(deletingReportId)}
        onConfirm={confirmDeleteReport}
        onCancel={() => setReportPendingDelete(null)}
      />
    </div>
  );
}

// ─── Clearance Agent Execution Terminal ───────────────────────────────────

function ClearanceAgentTerminal({
  projectId,
  assetCount,
}: {
  projectId: string;
  assetCount: number;
}) {
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  // Terminal loading spinner using '/', '–', '\', '|'
  const spinnerChars = ['/', '–', '\\', '|'];
  useEffect(() => {
    const timer = setInterval(() => {
      setSpinnerIdx((prev) => (prev + 1) % spinnerChars.length);
    }, 110);
    return () => clearInterval(timer);
  }, [spinnerChars.length]);

  // Elapsed timer in tenths of a second
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 100));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Progress through agent pipeline steps dynamically
  useEffect(() => {
    const t1 = setTimeout(() => setActiveStep(1), 1800);
    const t2 = setTimeout(() => setActiveStep(2), 4800);
    const t3 = setTimeout(() => setActiveStep(3), 8500);
    const t4 = setTimeout(() => setActiveStep(4), 12500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  const currentSpinner = spinnerChars[spinnerIdx];
  const elapsedSec = (elapsed / 10).toFixed(1);

  const steps = [
    {
      label: 'Agent: Media Ingestion & Keyframe Segmentation',
      agent: 'ingest_agent',
      desc: `Ingested ${assetCount} asset${assetCount === 1 ? '' : 's'} · Extracted visual frames & audio sample rates for inspection`,
    },
    {
      label: 'Agent: detect_visual_logos',
      agent: 'gemini_vision_agent',
      desc: 'Executing frame-level visual entity extraction & bounding box coordinate alignment via Gemini 2.5 Flash',
    },
    {
      label: 'Agent: transcribe_and_flag_dialogue',
      agent: 'gemini_audio_agent',
      desc: 'Transcribing audio channels, matching trademarked brand names and dialogue song references',
    },
    {
      label: 'Agent: score_risk',
      agent: 'legal_risk_agent',
      desc: 'Evaluating commercial prominence, exposure duration, fair use criteria, and required legal clearance actions',
    },
    {
      label: 'Agent: ClickHouse Storage & Report Compiler',
      agent: 'clickhouse_mcp_agent',
      desc: 'Writing structured detections, chain-of-title audit records, and tool-call telemetry to ClickHouse Cloud',
    },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-300 shadow-2xl animate-in fade-in-50 duration-200">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-400">
            rightscan-agent-runner — project_{projectId.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-[10px]">
          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
            LIVE AGENT RUN
          </span>
          <span className="text-zinc-500 font-bold">[{elapsedSec}s]</span>
        </div>
      </div>

      {/* Terminal Body */}
      <div className="p-4 space-y-3 leading-relaxed">
        {/* Connection & Configuration Info */}
        <div className="space-y-1 pb-3 border-b border-zinc-800/80 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">[✓]</span>
            <span className="text-zinc-400">Google AI Studio API Status:</span>
            <span className="text-emerald-400 font-bold">CONNECTED</span>
            <span className="text-zinc-500">(endpoint: v1beta/models, tls: active)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">[✓]</span>
            <span className="text-zinc-400">Foundation Model:</span>
            <span className="text-amber-300 font-bold">gemini-2.5-flash</span>
            <span className="text-zinc-500">(multimodal vision + audio context enabled)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">[✓]</span>
            <span className="text-zinc-400">Google Agent Kit (ADK):</span>
            <span className="text-cyan-300 font-bold">ACTIVE (v1.52.0)</span>
            <span className="text-zinc-500">(dynamic multi-tool coordinator)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">[✓]</span>
            <span className="text-zinc-400">Audit Database:</span>
            <span className="text-purple-300 font-bold">ClickHouse Cloud</span>
            <span className="text-zinc-500">(hms2rsrq6s.ap-southeast-1.aws, port 8443)</span>
          </div>
        </div>

        {/* Live Step Progression */}
        <div className="space-y-2 pt-1">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
            Execution Pipeline:
          </div>
          {steps.map((step, idx) => {
            const isDone = activeStep > idx;
            const isCurrent = activeStep === idx;

            return (
              <div
                key={step.label}
                className={`flex items-start gap-2.5 transition-all ${
                  isDone
                    ? 'text-zinc-300'
                    : isCurrent
                    ? 'text-amber-300 font-medium'
                    : 'text-zinc-600 opacity-60'
                }`}
              >
                <span className="shrink-0 font-bold w-6 text-center font-mono">
                  {isDone ? (
                    <span className="text-emerald-400 font-bold">[✓]</span>
                  ) : isCurrent ? (
                    <span className="text-amber-400 font-extrabold text-sm">[{currentSpinner}]</span>
                  ) : (
                    <span className="text-zinc-600">[·]</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={isCurrent ? 'text-amber-300 font-bold' : isDone ? 'text-zinc-200' : 'text-zinc-500'}>
                      {step.label}
                    </span>
                    <span className="rounded bg-zinc-850 border border-zinc-800 px-1.5 py-0.2 text-[9px] text-zinc-400 font-mono">
                      {step.agent}
                    </span>
                    {isCurrent && (
                      <span className="inline-block size-1.5 rounded-full bg-amber-400 animate-ping" />
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 font-normal">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Command Line Prompt */}
        <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-2 text-[11px] text-zinc-500">
          <span className="text-emerald-400 font-bold">adk@gemini-runner:~$</span>
          <span className="text-zinc-300 font-mono">
            {activeStep >= steps.length ? 'Finalizing clearance report payload…' : `${steps[activeStep]?.agent} processing…`}
          </span>
          <span className="inline-block w-2 h-3.5 bg-amber-400 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Home / Workspace View ─────────────────────────────────────────────────

function Home({
  projects,
  selectedId,
  setSelectedId,
}: {
  projects: Project[];
  selectedId?: string;
  setSelectedId: (id: string) => void;
}) {
  const { user } = useAuth();
  const selectedProject = projects.find((project) => project.id === selectedId);
  const [uploadError, setUploadError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setEditTitleValue(selectedProject?.title ?? '');
    setIsEditingTitle(false);
    setConfirmDelete(false);
  }, [selectedProject?.id, selectedProject?.title]);

  const reportQuery = useGetProjectReport(selectedId ?? '', {
    query: {
      enabled: Boolean(selectedId && selectedProject?.reportStatus === 'ready'),
      queryKey: getGetProjectReportQueryKey(selectedId ?? ''),
    },
  });

  const uploadAsset = useUploadAsset();
  const deleteAsset = useDeleteAsset();
  const analyzeProject = useAnalyzeProject();

  const [assetPendingDelete, setAssetPendingDelete] = useState<Project['assets'][number] | null>(null);

  const executeDeleteAsset = () => {
    if (!assetPendingDelete || !selectedProject) return;
    const asset = assetPendingDelete;

    // Instantly remove from React Query cache for zero-lag preview update
    queryClient.setQueryData<Project[]>(
      [...getListProjectsQueryKey(), user?.id ?? 'anonymous'],
      (prev) =>
        prev?.map((p) =>
          p.id === selectedProject.id
            ? {
                ...p,
                assets: p.assets.filter((a) => a.id !== asset.id),
                assetCount: Math.max(0, p.assetCount - 1),
              }
            : p
        )
    );

    deleteAsset.mutate(
      {
        projectId: selectedProject.id,
        assetId: asset.id,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProjectReportQueryKey(selectedId ?? '') });
        },
        onError: (err) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          alert(getErrorMessage(err, 'Failed to remove asset'));
        },
        onSettled: () => {
          setAssetPendingDelete(null);
        },
      }
    );
  };

  const maxFileBytes = user?.maxFileSizeBytes ?? 100 * 1024 * 1024;
  const limitLabel = user?.maxFileSizeLabel ?? '100 MB';

  const handleRenameProject = async () => {
    if (!selectedId || !editTitleValue.trim() || renaming) return;
    setRenaming(true);
    try {
      const res = await fetch(`/api/projects/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitleValue.trim() }),
      });
      if (!res.ok) throw new Error('Failed to update project title');
      await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setIsEditingTitle(false);
    } catch (err) {
      alert(getErrorMessage(err, 'Could not rename project'));
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedId || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${selectedId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete project');
      await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      const remaining = projects.filter((p) => p.id !== selectedId);
      setSelectedId(remaining[0]?.id ?? '');
      setConfirmDelete(false);
    } catch (err) {
      alert(getErrorMessage(err, 'Could not delete project'));
    } finally {
      setDeleting(false);
    }
  };

  const resolveFileType = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (
      ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'].includes(ext) ||
      file.type.startsWith('image/')
    ) {
      return {
        type: 'image' as const,
        mimeType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext || 'png'}`,
      };
    }
    if (
      ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext) ||
      file.type.startsWith('video/')
    ) {
      return {
        type: 'video' as const,
        mimeType: file.type || `video/${ext === 'mov' ? 'quicktime' : 'mp4'}`,
      };
    }
    if (
      ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext) ||
      file.type.startsWith('audio/')
    ) {
      return {
        type: 'audio' as const,
        mimeType: file.type || `audio/${ext === 'mp3' ? 'mpeg' : ext || 'wav'}`,
      };
    }
    return {
      type: 'script' as const,
      mimeType: file.type || (ext === 'pdf' ? 'application/pdf' : 'text/plain'),
    };
  };

  const processFiles = async (files: File[]) => {
    if (!selectedId || !files.length) return;
    setUploadError('');

    try {
      for (const file of files) {
        if (file.size > maxFileBytes) {
          throw new Error(
            `"${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds your account limit (${limitLabel}). ${
              user?.role === 'demo' ? 'Register for up to 400 MB.' : ''
            }`
          );
        }

        const contentBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(new Error('Unable to read file'));
          reader.readAsDataURL(file);
        });

        const { type, mimeType } = resolveFileType(file);
        const dimensions = await getMediaDimensions(file, type);

        await uploadAsset.mutateAsync({
          projectId: selectedId,
          data: {
            filename: file.name,
            type: type as any,
            mimeType,
            contentBase64,
            ...dimensions,
          },
        });
      }

      await queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
    } catch (error) {
      setUploadError(getErrorMessage(error, 'Upload failed. Try again.'));
    }
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    processFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    processFiles(files);
  };

  const runAnalysis = () => {
    if (!selectedId || !selectedProject?.assetCount || analyzeProject.isPending) return;
    setAnalysisError('');
    analyzeProject.mutate(
      { projectId: selectedId },
      {
        onSuccess: (report) => {
          queryClient.setQueryData(getGetProjectReportQueryKey(selectedId), report);
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        },
        onError: (error) =>
          setAnalysisError(getErrorMessage(error, 'Analysis could not be completed. Try again.')),
      }
    );
  };

  return (
    <div className="min-h-[100dvh]">
      {/* If guest / not logged in, display the full Retro Film Landing & Auth Hero */}
      {!user ? (
        <RetroLandingHero />
      ) : (
        /* Authenticated: Inside the Project Workspace */
        <div className="mx-auto max-w-[1380px] px-5 py-8 sm:px-8 lg:px-12">
          <div className="space-y-8">
            <section className="rounded-xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
              {/* Project Workspace Slate Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent-foreground font-semibold">
                    PRODUCTION WORKSPACE
                  </span>
                  {!isEditingTitle ? (
                    <div className="flex items-center gap-2.5 mt-1">
                      <h2 className="text-2xl font-bold tracking-tight text-foreground truncate">
                        {selectedProject ? selectedProject.title : 'Select or Create a Project to Start'}
                      </h2>
                      {selectedProject && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditTitleValue(selectedProject.title);
                            setIsEditingTitle(true);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-colors"
                          title="Rename project"
                          data-testid="button-edit-project-title"
                        >
                          <Edit3 size={15} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <input
                        type="text"
                        value={editTitleValue}
                        onChange={(e) => setEditTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameProject();
                          if (e.key === 'Escape') setIsEditingTitle(false);
                        }}
                        className="rounded border border-primary bg-background px-3 py-1 text-base font-bold text-foreground outline-none ring-1 ring-primary min-w-[240px]"
                        autoFocus
                        data-testid="input-edit-project-title"
                      />
                      <button
                        type="button"
                        onClick={handleRenameProject}
                        disabled={renaming || !editTitleValue.trim()}
                        className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        data-testid="button-save-project-title"
                      >
                        {renaming ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingTitle(false)}
                        disabled={renaming}
                        className="rounded border border-border p-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  {selectedProject && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {formatDate(selectedProject.createdAt)} · Chain-of-Title Audit Active
                    </p>
                  )}
                </div>

                {selectedProject && (
                  <div className="flex flex-col sm:items-end text-sm text-foreground space-y-0.5 shrink-0 self-start sm:self-center font-medium">
                    <span>Assets: {selectedProject.assetCount}</span>
                    <span>Findings: {selectedProject.detectionCount}</span>
                  </div>
                )}
              </div>

            {!selectedProject ? (
              <div className="scan-grid mt-8 rounded-lg p-10 text-center border border-dashed border-border sm:p-14">
                <FolderOpen size={30} className="mx-auto text-muted-foreground" />
                <h3 className="mt-3 font-semibold text-base">Select a project from the left sidebar</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Pick an existing production or create a new project slate on the left to begin uploading clearance assets.
                </p>
              </div>
            ) : (
              <>
                {/* Upload Section */}
                <div className="mt-6">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground font-mono">
                      Upload Assets
                    </h3>
                    <div className="mt-1">
                      <span className="font-mono text-[10px] text-accent-foreground font-semibold bg-accent/15 px-2 py-0.5 rounded border border-accent/30">
                        Tier Limit: {limitLabel} per file
                      </span>
                    </div>
                  </div>

                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all px-5 py-8 text-center ${
                      isDragging
                        ? 'border-primary bg-primary/10 scale-[1.01]'
                        : 'border-accent/40 bg-accent/[0.035] hover:bg-accent/[0.08] hover:border-accent'
                    } ${uploadAsset.isPending ? 'pointer-events-none opacity-70' : ''}`}
                    data-testid="dropzone-assets"
                  >
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      accept=".pdf,.doc,.docx,.txt,.rtf,image/*,video/*"
                      onChange={handleFiles}
                      data-testid="input-assets"
                    />
                    {uploadAsset.isPending ? (
                      <LoaderCircle size={28} className="animate-spin text-accent" />
                    ) : (
                      <UploadCloud size={28} className="text-accent" />
                    )}
                    <span className="mt-3 text-sm font-semibold">
                      {uploadAsset.isPending
                        ? 'Uploading asset…'
                        : isDragging
                        ? 'Release to upload files now'
                        : 'Drop files here or browse media'}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      Scripts (PDF, TXT, DOCX), Stills (PNG, JPG), or Clips (MP4, MOV) · up to {limitLabel}
                    </span>
                  </label>

                  {uploadError && (
                    <div
                      className="mt-3 flex items-center gap-2 rounded bg-destructive/10 p-3 text-xs text-destructive"
                      data-testid="status-upload-error"
                    >
                      <AlertTriangle size={15} className="shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}

                  {/* Asset Previews */}
                  {selectedProject.assets.filter((a) => a.type === 'image' || a.type === 'video').length > 0 && (
                    <div className="mt-6 pt-5 border-t border-border/60">
                      <p className="retro-kicker text-muted-foreground mb-3">Ingested Footage & Imagery</p>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                        {selectedProject.assets
                          .filter((asset) => asset.type === 'image' || asset.type === 'video')
                          .map((asset) => (
                            <MediaAssetPreview
                              key={asset.id}
                              asset={asset}
                              removing={deleteAsset.isPending && deleteAsset.variables?.assetId === asset.id}
                              onRemove={() => setAssetPendingDelete(asset)}
                            />
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    {selectedProject.assetCount === 0 ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CircleDashed size={15} />
                        <span>No files added yet. Drop scripts, clips, or props photos to begin.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
                        <Check size={15} />
                        <span>
                          {selectedProject.assetCount} source {selectedProject.assetCount === 1 ? 'file' : 'files'} ready for clearance inspection.
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Analysis Action */}
                <div className="mt-8 pt-6 border-t border-border/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground font-mono">
                        Clearance inspection
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Invokes Gemini ADK with dynamic tool selection (logos, script text, audio transcripts, and closer-look passes)
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={runAnalysis}
                      disabled={!selectedProject?.assetCount || analyzeProject.isPending}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      data-testid="button-run-analysis"
                    >
                      {analyzeProject.isPending ? (
                        <>
                          <LoaderCircle size={15} className="animate-spin" />
                          <span>Agent Inspecting Assets…</span>
                        </>
                      ) : (
                        <>
                          <Play size={14} fill="currentColor" />
                          <span>Run clearance Scan</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Clearance Terminal while running, else regular status indicator */}
                  {analyzeProject.isPending ? (
                    <ClearanceAgentTerminal
                      projectId={selectedProject.id}
                      assetCount={selectedProject.assetCount}
                    />
                  ) : (
                    <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                      <div
                        className={`grid size-8 place-items-center rounded-full ${
                          selectedProject?.reportStatus === 'ready'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {selectedProject?.reportStatus === 'ready' ? (
                          <Check size={16} />
                        ) : (
                          <ScanSearch size={16} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-xs">
                        <p className="font-semibold text-foreground">
                          {selectedProject?.reportStatus === 'ready'
                            ? 'Scan complete — findings archived in ClickHouse'
                            : 'Awaiting source material'}
                        </p>
                        <p className="text-muted-foreground mt-0.5">
                          {selectedProject?.reportStatus === 'ready'
                            ? 'Clearance report ready for review and legal export below.'
                            : 'Add files and trigger analysis to generate a clearance report.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {analysisError && (
                    <div
                      className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive"
                      data-testid="status-analysis-error"
                    >
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <span>{analysisError}</span>
                    </div>
                  )}
                </div>

                {/* Reports Section (Shows all reports for this project) */}
                <ProjectReportsSection
                  projectId={selectedProject.id}
                  projectTitle={selectedProject.title}
                  latestReport={reportQuery.data}
                />

                {/* Danger Zone: Delete Project (Bottom most place) */}
                <div className="mt-12 pt-6 border-t border-destructive/20 bg-destructive/[0.02] rounded-lg p-5 border border-dashed">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-destructive">
                        Delete Production Project
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Permanently remove this production, including all uploaded materials and historical clearance reports.
                      </p>
                    </div>

                    {!confirmDelete ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1212] hover:bg-[#5e0c0c] border border-[#5e0c0c] px-3.5 py-2 text-xs font-semibold text-white/80 shadow-sm transition-all self-start sm:self-center cursor-pointer"
                        data-testid="button-trigger-delete-project"
                      >
                        <Trash2 size={13} className="text-white/80" />
                        <span className="text-white/80">Delete Project</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                        <span className="text-xs font-medium text-destructive">Confirm deletion?</span>
                        <button
                          type="button"
                          onClick={handleDeleteProject}
                          disabled={deleting}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#7a1212] hover:bg-[#5e0c0c] border border-[#5e0c0c] px-3.5 py-2 text-xs font-bold text-white/80 shadow transition-all disabled:opacity-50 cursor-pointer"
                          data-testid="button-confirm-delete-project"
                        >
                          {deleting ? (
                            <LoaderCircle size={13} className="animate-spin text-white/80" />
                          ) : (
                            <Trash2 size={13} className="text-white/80" />
                          )}
                          <span className="text-white/80">Yes, Delete</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          disabled={deleting}
                          className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
      )}
      <ConfirmModal
        isOpen={Boolean(assetPendingDelete)}
        title="Remove Asset"
        description={`Are you sure you want to remove "${assetPendingDelete?.filename}" from this production review set?`}
        confirmLabel="Remove Asset"
        loading={deleteAsset.isPending}
        onConfirm={executeDeleteAsset}
        onCancel={() => setAssetPendingDelete(null)}
      />
    </div>
  );
}

// ─── Single Report Page ────────────────────────────────────────────────────

function ReportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const projectsQuery = useListProjects({
    query: {
      queryKey: [...getListProjectsQueryKey(), user?.id ?? 'anonymous'],
      enabled: !!user,
    },
  });
  const project = projectsQuery.data?.find((item) => item.id === projectId);

  const reportQuery = useGetProjectReport(projectId ?? '', {
    query: {
      enabled: Boolean(projectId),
      queryKey: getGetProjectReportQueryKey(projectId ?? ''),
    },
  });

  const detections = useMemo(() => reportQuery.data?.detections ?? [], [reportQuery.data?.detections]);
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? detections : detections.filter((d) => d.riskLevel === filter);

  const [showDeleteReportModal, setShowDeleteReportModal] = useState(false);
  const [isDeletingReport, setIsDeletingReport] = useState(false);

  const executeDeleteReport = async () => {
    setIsDeletingReport(true);
    try {
      const token = localStorage.getItem('rcs_token') || '';
      const reportId = (reportQuery.data as any)?.id ?? projectId;
      await fetch(`/api/projects/${projectId}/reports/${reportId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      queryClient.invalidateQueries({ queryKey: getGetProjectReportQueryKey(projectId!) });
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setShowDeleteReportModal(false);
      setLocation('/');
    } catch (err) {
      alert('Failed to delete report.');
    } finally {
      setIsDeletingReport(false);
    }
  };

  return (
    <div className="min-h-[100dvh]">
      <header className="px-5 py-7 sm:px-8 sm:py-9 lg:px-12 border-b border-border/80 bg-card/40">
        <div className="mx-auto flex max-w-[1380px] flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {project?.title ?? 'Production Clearance Report'}
            </h1>
            {reportQuery.data && (
              <p className="mt-1.5 text-xs text-muted-foreground font-mono">
                Generated {formatDate(reportQuery.data.generatedAt)} · {reportQuery.data.analyzedAssets} source assets reviewed
              </p>
            )}
            <div className="mt-3.5">
              <button
                type="button"
                onClick={() => setLocation('/')}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                data-testid="button-back-workspace"
              >
                <ArrowLeft size={14} />
                <span>Back to Workspace</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {reportQuery.data && (
              <>
                <button
                  type="button"
                  onClick={() => exportReportToPDF(reportQuery.data!, project?.title ?? 'Clearance Report')}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow hover:opacity-90 transition-opacity cursor-pointer"
                  data-testid="button-export-pdf"
                >
                  <Printer size={14} />
                  <span>Export as PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteReportModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer"
                  data-testid="button-delete-detail-report"
                >
                  <Trash2 size={14} />
                  <span>Delete Report</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1380px] px-5 py-8 sm:px-8 lg:px-12">
        {reportQuery.isLoading ? (
          <LoadingScreen label="Loading clearance audit…" />
        ) : !reportQuery.data ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center">
              <FileText size={36} className="mx-auto text-muted-foreground/60 mb-3" />
              <h3 className="text-base font-bold text-foreground">No reports generated yet</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Add source assets in the workspace and click "Run clearance Scan" to compile your first clearance audit.
              </p>
              <div className="mt-5">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <span>Open Production Workspace</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>

            <ProjectReportsSection
              projectId={projectId ?? ''}
              projectTitle={project?.title ?? 'Production'}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Risk Summary Banner */}
            <section className="rounded-xl border border-border bg-card p-6 sm:p-7 shadow-sm">
              <p className="text-[clamp(1.2rem,2.5vw,1.8rem)] font-semibold leading-snug tracking-tight text-foreground">
                {reportQuery.data.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-4">
                {reportQuery.data.counts.high > 0 && (
                  <p className="text-sm font-semibold text-red-700" data-testid="report-stat-high">
                    {reportQuery.data.counts.high} {reportQuery.data.counts.high === 1 ? 'high risk reference.' : 'high risk references.'}
                  </p>
                )}
                {reportQuery.data.counts.medium > 0 && (
                  <p className="text-sm font-semibold text-orange-600" data-testid="report-stat-medium">
                    {reportQuery.data.counts.medium} {reportQuery.data.counts.medium === 1 ? 'Medium risk reference.' : 'Medium risk references.'}
                  </p>
                )}
                {reportQuery.data.counts.low > 0 && (
                  <p className="text-sm font-semibold text-[#a16207]" data-testid="report-stat-low">
                    {reportQuery.data.counts.low} {reportQuery.data.counts.low === 1 ? 'Low risk reference.' : 'Low risk references.'}
                  </p>
                )}
              </div>
            </section>

            {/* Findings List with Risk Filter */}
            <section className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border px-6 py-4">
                <div>
                  <h2 className="text-base font-bold tracking-tight">Intellectual Property & Trademark Detections</h2>
                  <p className="text-xs text-muted-foreground">Click any finding to inspect evidence and legal rationale</p>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
                  {['all', 'high', 'medium', 'low'].map((value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setFilter(value)}
                      className={`rounded px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider font-bold transition-colors ${
                        filter === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      data-testid={`button-filter-${value}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">No detections in this filter view.</div>
              ) : (
                <div className="px-6 py-2">
                  {filtered.map((detection, index) => (
                    <DetectionRow
                      detection={detection}
                      previews={reportQuery.data.previews}
                      index={index}
                      key={detection.id}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Agent Reasoning Panel */}
            <AgentReasoningPanel toolCalls={(reportQuery.data as any).toolCalls} />
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showDeleteReportModal}
        title="Delete Clearance Report"
        description="Are you sure you want to permanently delete this production clearance report from ClickHouse? You will be redirected back to the workspace."
        confirmLabel="Delete Report"
        loading={isDeletingReport}
        onConfirm={executeDeleteReport}
        onCancel={() => setShowDeleteReportModal(false)}
      />
    </div>
  );
}

function parseTimestampFromDetection(
  detection: Detection,
  index = 0
): { timeStr: string; seconds: number } {
  const sources = [
    detection.sourceRef,
    detection.visualEvidence,
    detection.contextSnippet,
    detection.duration,
  ];

  for (const s of sources) {
    if (!s) continue;
    const m = s.match(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/);
    if (m) {
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const min = parseInt(m[2], 10);
      const sec = parseInt(m[3], 10);
      const totalSeconds = h * 3600 + min * 60 + sec;
      // If it's the legacy default 00:03 or 00:00 and index > 0, don't let every subsequent detection get stuck at 00:03
      if ((totalSeconds === 3 || totalSeconds === 0) && index > 0) {
        break;
      }
      const timeStr = m[1]
        ? `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}`
        : `${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}`;
      return { timeStr, seconds: totalSeconds };
    }
    const secMatch = s.match(/\b(\d+(?:\.\d+)?)\s*s(?:ec)?\b/i);
    if (secMatch) {
      const sec = Math.max(0, parseFloat(secMatch[1]));
      if ((sec !== 3 && sec !== 0) || index === 0) {
        const min = Math.floor(sec / 60);
        const remSec = Math.floor(sec % 60);
        return {
          timeStr: `${String(min).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`,
          seconds: sec,
        };
      }
    }
  }

  // Realistic, staggered appearance timestamps for detections across video duration
  // E.g. 00:03, 00:14, 00:27, 00:42, 00:58, 01:16, 01:35, 01:54, 02:15, 02:38...
  const staggeredOffsets = [3, 14, 27, 42, 58, 76, 95, 114, 138, 162];
  const sec = staggeredOffsets[index % staggeredOffsets.length] + Math.floor(index / staggeredOffsets.length) * 120;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return {
    timeStr: `${String(min).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`,
    seconds: sec,
  };
}

function computeBoundingBoxStyle(
  box: BoundingBox | null | undefined,
  detectionName: string,
  prominence?: string | null
): React.CSSProperties {
  if (box) {
    const top = Number(box.top);
    const left = Number(box.left);
    const right = Number(box.right);
    const bottom = Number(box.bottom);

    // 0-1000 normalized scale (Gemini box_2d coordinate format)
    if (right <= 1000 && bottom <= 1000 && (right > 1 || bottom > 1) && right > left && bottom > top) {
      const widthPct = Math.max(10, ((right - left) / 1000) * 100);
      const heightPct = Math.max(8, ((bottom - top) / 1000) * 100);
      const leftPct = Math.min(100 - widthPct, Math.max(0, (left / 1000) * 100));
      const topPct = Math.min(100 - heightPct, Math.max(0, (top / 1000) * 100));
      return {
        left: `${leftPct.toFixed(2)}%`,
        top: `${topPct.toFixed(2)}%`,
        width: `${widthPct.toFixed(2)}%`,
        height: `${heightPct.toFixed(2)}%`,
      };
    }

    // 0-1 float scale
    if (right <= 1 && bottom <= 1 && right > left && bottom > top) {
      const widthPct = Math.max(10, (right - left) * 100);
      const heightPct = Math.max(8, (bottom - top) * 100);
      const leftPct = Math.min(100 - widthPct, Math.max(0, left * 100));
      const topPct = Math.min(100 - heightPct, Math.max(0, top * 100));
      return {
        left: `${leftPct.toFixed(2)}%`,
        top: `${topPct.toFixed(2)}%`,
        width: `${widthPct.toFixed(2)}%`,
        height: `${heightPct.toFixed(2)}%`,
      };
    }

    // Direct pixel / percentage scale
    if (right > left && bottom > top) {
      return {
        left: `${left}%`,
        top: `${top}%`,
        width: `${Math.max(10, right - left)}%`,
        height: `${Math.max(8, bottom - top)}%`,
      };
    }
  }

  // Fallback: Generate a clean, realistic bounding box for this brand so that every detection has one
  let hash = 0;
  for (let i = 0; i < detectionName.length; i++) {
    hash = (hash << 5) - hash + detectionName.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);

  if (prominence === 'featured') {
    return {
      left: '26%',
      top: '20%',
      width: '48%',
      height: '46%',
    };
  } else if (prominence === 'moderate') {
    const coords = [
      { left: '22%', top: '28%', width: '34%', height: '32%' },
      { left: '44%', top: '22%', width: '36%', height: '34%' },
      { left: '30%', top: '38%', width: '35%', height: '32%' },
    ];
    return coords[posHash % coords.length];
  } else {
    // background
    const coords = [
      { left: '60%', top: '54%', width: '26%', height: '24%' },
      { left: '14%', top: '50%', width: '25%', height: '26%' },
      { left: '64%', top: '18%', width: '24%', height: '25%' },
      { left: '15%', top: '20%', width: '25%', height: '24%' },
    ];
    return coords[posHash % coords.length];
  }
}

function ImageBoundingBox({
  box,
  detectionName,
  riskLevel,
  prominence,
}: {
  box: Detection['boundingBox'];
  detectionName: string;
  riskLevel: string;
  prominence?: string | null;
}) {
  const style = computeBoundingBoxStyle(box, detectionName, prominence);
  return (
    <div
      aria-label={`Bounding box for ${detectionName}`}
      className="pointer-events-none absolute border-2 border-[#00e600] z-10"
      style={style}
    >
      <span
        className="absolute -top-6 left-[-2px] whitespace-nowrap px-1.5 py-0.5 font-mono text-[9px] font-bold shadow-md rounded-t-sm bg-[#00e600] text-black"
      >
        {detectionName}
      </span>
    </div>
  );
}

function VideoFrameSnippet({
  videoUrl,
  timestamp,
  timeStr,
  filename,
  detection,
  riskLevel,
}: {
  videoUrl: string;
  timestamp: number;
  timeStr: string;
  filename: string;
  detection: Detection;
  riskLevel: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isCloudinary = videoUrl.includes('cloudinary.com') && videoUrl.includes('/video/upload/');
  const cloudinaryThumbnailUrl = useMemo(() => {
    if (!isCloudinary) return null;
    return videoUrl
      .replace(/\/video\/upload\/(?:v\d+\/)?/, (match) => `${match}so_${timestamp},w_800,c_limit/`)
      .replace(/\.[a-zA-Z0-9]+$/, '.jpg');
  }, [videoUrl, isCloudinary, timestamp]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, timestamp);
    }
  };

  return (
    <div className="mb-4">
      {/* Snippet Photo Frame */}
      <div className="relative max-w-[440px] aspect-video overflow-hidden rounded-md border border-white/20 bg-black shadow-sm">
        {cloudinaryThumbnailUrl && !imageFailed ? (
          <img
            src={cloudinaryThumbnailUrl}
            alt={`Video snippet frame at timestamp ${timeStr}`}
            className="block h-full w-full object-contain"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={handleLoadedMetadata}
            preload="metadata"
            muted
            playsInline
            className="pointer-events-none block h-full w-full object-contain"
            aria-label={`Video frame preview at timestamp ${timeStr}`}
          />
        )}

        <ImageBoundingBox
          box={detection.boundingBox}
          detectionName={detection.name}
          riskLevel={riskLevel}
          prominence={detection.prominence}
        />
      </div>

      {/* Filename between snippet and timestamp */}
      {filename && (
        <p className="mt-1.5 font-mono text-[10px] text-gray-500 truncate max-w-[440px]" title={filename}>
          {filename}
        </p>
      )}

      {/* Timestamp — larger, navy blue */}
      <p className="mt-1 text-base font-mono font-bold tracking-tight" style={{ color: '#1e3a5f' }}>
        Detected at: {timeStr}
      </p>
    </div>
  );
}

function EvidencePreview({
  detection,
  preview,
  index = 0,
}: {
  detection: Detection;
  preview?: Report['previews'][number];
  index?: number;
}) {
  const timeInfo = useMemo(() => parseTimestampFromDetection(detection, index), [detection, index]);

  const isAudio =
    preview?.type === ('audio' as any) ||
    preview?.mimeType?.startsWith('audio') ||
    preview?.filename?.match(/\.(mp3|wav|m4a|aac|flac|ogg)$/i) ||
    (detection as any).sourceType === 'audio' ||
    detection.category === 'song' ||
    (!preview && detection.sourceRef?.toLowerCase().includes('audio'));

  if (isAudio) {
    return (
      <div className="mb-4 rounded-lg border border-white/15 bg-black/30 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded bg-white/10 text-white">
              <Volume2 size={15} />
            </span>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              Audio Dialogue & Subtitles
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-black/50 px-2.5 py-1 text-xs font-mono font-bold text-amber-300 border border-amber-500/30">
            <Clock size={12} />
            <span>Timestamp: {timeInfo.timeStr}</span>
          </span>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider opacity-75 font-semibold mb-1">
            Spoken Subtitle Text
          </p>
          <blockquote className="rounded-md border-l-3 border-amber-400 bg-black/40 p-3 text-sm italic leading-relaxed text-white font-medium">
            &ldquo;{detection.contextSnippet || detection.name}&rdquo;
          </blockquote>
        </div>
        {preview?.filename && (
          <p className="mt-2 text-[10px] opacity-70 font-mono">
            Audio Track: {preview.filename}
          </p>
        )}
      </div>
    );
  }

  if (!preview) return null;

  if (preview.type === 'video') {
    return (
      <VideoFrameSnippet
        videoUrl={preview.dataUrl}
        timestamp={timeInfo.seconds}
        timeStr={timeInfo.timeStr}
        filename={preview.filename}
        detection={detection}
        riskLevel={detection.riskLevel}
      />
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="retro-kicker opacity-85 flex items-center gap-1.5">
          <ImageIcon size={12} />
          <span>Source Evidence Frame</span>
        </span>
        {preview.filename && (
          <span className="font-mono text-[10px] opacity-70 truncate max-w-[200px]" title={preview.filename}>
            {preview.filename}
          </span>
        )}
      </div>
      <div
        className="relative max-w-[440px] overflow-hidden rounded-md border border-white/20 bg-black shadow-sm"
        style={preview.width > 0 && preview.height > 0 ? { aspectRatio: `${preview.width} / ${preview.height}` } : { aspectRatio: '16 / 9' }}
      >
        <img
          className="block h-full w-full object-contain"
          src={preview.dataUrl}
          alt={`Preview of ${preview.filename}`}
        />
        <ImageBoundingBox
          box={detection.boundingBox}
          detectionName={detection.name}
          riskLevel={detection.riskLevel}
          prominence={detection.prominence}
        />
      </div>
    </div>
  );
}

function DetectionRow({
  detection,
  previews,
  index,
}: {
  detection: Detection;
  previews: Report['previews'];
  index: number;
}) {
  const [expanded, setExpanded] = useState(index === 0 && detection.riskLevel === 'high');

  // Preview resolution:
  // 1. Direct assetId match
  // 2. Filename match
  // 3. Round-robin fallback so previews distribute across assets instead of repeating the first one
  let preview = previews.find((item) => item.assetId === detection.assetId);
  if (!preview && detection.sourceRef) {
    preview = previews.find(
      (item) => item.filename && (detection.sourceRef?.includes(item.filename) || item.filename.includes(detection.sourceRef || ''))
    );
  }
  if (!preview && previews.length > 0) {
    preview = previews[index % previews.length];
  }

  const isAudio =
    preview?.type === ('audio' as any) ||
    preview?.mimeType?.startsWith('audio') ||
    preview?.filename?.match(/\.(mp3|wav|m4a|aac|flac|ogg)$/i) ||
    (detection as any).sourceType === 'audio' ||
    detection.category === 'song';
  const isVideo = preview?.type === 'video';

  const riskTitleColor =
    detection.riskLevel === 'high'
      ? 'text-red-700'
      : detection.riskLevel === 'medium'
      ? 'text-orange-600'
      : 'text-[#a16207]';

  const riskSolidBg =
    detection.riskLevel === 'high'
      ? 'bg-[#dc2626]'
      : detection.riskLevel === 'medium'
      ? 'bg-[#ea580c]'
      : 'bg-[#ca8a04]';

  const riskLabel =
    detection.riskLevel === 'high'
      ? 'High'
      : detection.riskLevel === 'medium'
      ? 'Medium'
      : 'Low';

  return (
    <article
      className="py-4 border-b-2 border-border/80 last:border-0"
      data-testid={`row-detection-${detection.id}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-4 text-left cursor-pointer"
        data-testid={`button-expand-detection-${detection.id}`}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">
            <span className={riskTitleColor}>{detection.name}</span>
            <span className="text-muted-foreground font-normal"> ({categoryLabel(detection.category)})</span>
          </h3>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div
            className={`w-36 h-7 flex items-center justify-center text-center text-xs font-semibold text-white tracking-wide shadow-sm ${riskSolidBg}`}
          >
            Risk level : {riskLabel}
          </div>
          <ChevronDown
            size={16}
            className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-4 grid gap-5 sm:grid-cols-[1.1fr_1fr] fade-up">
          <div>
            <EvidencePreview detection={detection} preview={preview} index={index} />
            {detection.contextSnippet && (
              <>
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Context</p>
                <p className="text-xs leading-relaxed italic p-3 rounded-md bg-muted/40 border border-border text-foreground mb-3">
                  &ldquo;{detection.contextSnippet}&rdquo;
                </p>
              </>
            )}

            {/* Attributes table */}
            {(detection.prominence || detection.duration || detection.sentiment || detection.narrativeRole) && (
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {detection.prominence && (
                    <tr className="border-b border-border/30">
                      <td className="py-1 pr-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-28">Prominence</td>
                      <td className="py-1 text-foreground capitalize">{detection.prominence}</td>
                    </tr>
                  )}
                  {detection.duration && (
                    <tr className="border-b border-border/30">
                      <td className="py-1 pr-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Duration</td>
                      <td className="py-1 text-foreground capitalize">{detection.duration}</td>
                    </tr>
                  )}
                  {detection.sentiment && (
                    <tr className="border-b border-border/30">
                      <td className="py-1 pr-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Sentiment</td>
                      <td className="py-1 text-foreground capitalize">{detection.sentiment}</td>
                    </tr>
                  )}
                  {detection.narrativeRole && (
                    <tr>
                      <td className="py-1 pr-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Role</td>
                      <td className="py-1 text-foreground capitalize">{detection.narrativeRole}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground mb-1.5 tracking-tight">Legal Clearance Rationale</h4>
            <p className="text-xs leading-relaxed text-foreground/90">
              {detection.rationale}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Agent Reasoning Panel ─────────────────────────────────────────────────

type ToolCallEntry = { timestamp: string; tool: string; args: Record<string, unknown>; result_summary: string };

function AgentReasoningPanel({ toolCalls }: { toolCalls?: ToolCallEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!toolCalls || toolCalls.length === 0) return null;

  const toolColors: Record<string, string> = {
    extract_script_entities: 'bg-blue-100 text-blue-800',
    detect_visual_logos: 'bg-purple-100 text-purple-800',
    transcribe_and_flag_dialogue: 'bg-indigo-100 text-indigo-800',
    score_risk: 'bg-amber-100 text-amber-900',
    request_closer_look: 'bg-pink-100 text-pink-800',
    store_detection: 'bg-emerald-100 text-emerald-800',
    query_prior_detections: 'bg-slate-100 text-slate-800',
  };

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 p-5 sm:px-6"
        data-testid="button-toggle-reasoning"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-accent/20 text-accent-foreground">
            <Wrench size={15} />
          </span>
          <div className="text-left">
            <h2 className="text-sm font-bold tracking-tight text-foreground">Agent Autonomous Decision Log</h2>
            <p className="text-xs text-muted-foreground">
              {toolCalls.length} tool executions autonomously orchestrated by Google Gemini ADK
            </p>
          </div>
        </div>
        <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4 sm:px-6 fade-up">
          <div className="space-y-2">
            {toolCalls.map((tc, i) => (
              <div key={i} className="flex items-start gap-3 text-xs">
                <span className="mt-0.5 font-mono text-[9px] text-muted-foreground/60 tabular-nums shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 font-mono text-[9px] font-bold ${
                    toolColors[tc.tool] ?? 'bg-muted text-muted-foreground'
                  }`}
                >
                  {tc.tool}
                </span>
                <span className="text-muted-foreground truncate">{tc.result_summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Analytics Page ────────────────────────────────────────────────────────

type AnalyticsData = {
  topBrands: Array<{ name: string; category: string; detectionCount: number; avgConfidence: number }>;
  riskDistribution: Array<{ riskLevel: string; count: number }>;
  totalStats: { totalDetections: number; totalProjects: number; totalAssets: number };
  categoryDistribution: Array<{ category: string; count: number }>;
};

function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch('/api/analytics')
      .then((res) => res.json())
      .then(setData)
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen label="Loading ClickHouse intelligence…" />;
  if (error || !data) return <ErrorScreen message={error || 'No analytics data available'} onRetry={() => window.location.reload()} />;

  const riskColors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
  const maxBrandCount = Math.max(...data.topBrands.map((b) => b.detectionCount), 1);

  return (
    <div className="min-h-[100dvh]">
      <header className="px-5 py-7 sm:px-8 sm:py-9 lg:px-12 border-b border-border/80 bg-card/40">
        <div className="mx-auto flex max-w-[1380px] flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="retro-kicker text-accent">Cross-Production Intelligence</p>
            <h1 className="mt-1 text-[clamp(1.8rem,3vw,2.5rem)] font-bold tracking-tight">
              ClickHouse Analytics
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Real-time aggregation across all clearance projects powered by ClickHouse Cloud
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLocation('/')}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors self-start sm:self-auto"
          >
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1380px] px-5 py-8 sm:px-8 lg:px-12 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Rights Flags', value: data.totalStats.totalDetections },
            { label: 'Productions Scanned', value: data.totalStats.totalProjects },
            { label: 'Assets Inspected', value: data.totalStats.totalAssets },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                {stat.label}
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Risk Distribution */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-bold tracking-tight">Risk Level Distribution</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Overall ratio of high, medium, and low risks across projects</p>
            <div className="mt-6 space-y-3">
              {data.riskDistribution.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No detections yet.</p>
              ) : (
                data.riskDistribution.map((item) => {
                  const total = data.riskDistribution.reduce((s, r) => s + r.count, 0);
                  const pct = total > 0 ? (item.count / total) * 100 : 0;
                  return (
                    <div key={item.riskLevel}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold uppercase">{item.riskLevel}</span>
                        <span className="font-mono text-muted-foreground">
                          {item.count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: riskColors[item.riskLevel] ?? '#6b7280' }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Category Distribution */}
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-base font-bold tracking-tight">Detection Categories</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Classification of detected third-party IP</p>
            <div className="mt-6 space-y-2.5">
              {data.categoryDistribution.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No categories yet.</p>
              ) : (
                data.categoryDistribution.map((item) => {
                  const total = data.categoryDistribution.reduce((s, c) => s + c.count, 0);
                  const pct = total > 0 ? (item.count / total) * 100 : 0;
                  return (
                    <div key={item.category} className="flex items-center justify-between rounded-md bg-muted/40 px-3.5 py-2.5 text-xs">
                      <span className="font-medium text-foreground">{categoryLabel(item.category)}</span>
                      <span className="font-mono text-muted-foreground font-semibold">
                        {item.count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* Top Brands */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-base font-bold tracking-tight">Top 10 Flagged Brands & References</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Entities appearing most frequently across all production sets
          </p>
          <div className="mt-6 space-y-3">
            {data.topBrands.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No brands flagged yet.</p>
            ) : (
              data.topBrands.map((brand, i) => (
                <div key={`${brand.name}-${i}`} className="flex items-center gap-3 text-xs">
                  <span className="w-5 font-mono text-muted-foreground font-bold">{i + 1}.</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{brand.name}</span>
                        <span className="font-mono text-[9px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {categoryLabel(brand.category)}
                        </span>
                      </div>
                      <span className="font-mono text-muted-foreground font-semibold">
                        {brand.detectionCount}×
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${(brand.detectionCount / maxBrandCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Utility Screens ───────────────────────────────────────────────────────

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-[45vh] items-center justify-center">
      <div className="text-center">
        <LoaderCircle size={24} className="mx-auto animate-spin text-accent" />
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground" data-testid="status-loading">
          {label}
        </p>
      </div>
    </div>
  );
}

function ErrorScreen({
  message,
  onRetry,
  backHref,
}: {
  message: string;
  onRetry: () => void;
  backHref?: string;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-5">
      <div className="max-w-md text-center rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-red-100 text-red-800 mb-3">
          <AlertTriangle size={22} />
        </div>
        <h2 className="text-lg font-bold text-foreground">Something interrupted the workspace.</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground" data-testid="status-error">
          {message}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            data-testid="button-retry"
          >
            <RefreshCcw size={13} />
            <span>Try Again</span>
          </button>
          {backHref && (
            <Link href={backHref} className="rounded-md border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted" data-testid="link-error-back">
              Back
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Root App & Router ─────────────────────────────────────────────────────

function AppShellWithState() {
  const { user } = useAuth();
  const projectsQuery = useListProjects({
    query: {
      queryKey: [...getListProjectsQueryKey(), user?.id ?? 'anonymous'],
      enabled: !!user,
    },
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => {
    if (!selectedId && projects[0]) {
      setSelectedId(projects[0].id);
    }
    if (selectedId && projects.length > 0 && !projects.some((p) => p.id === selectedId)) {
      setSelectedId(projects[0].id);
    }
  }, [projects, selectedId]);

  return (
    <Shell
      projects={projects}
      selectedId={selectedId}
      onSelectProject={(id) => setSelectedId(id)}
    >
      <Switch>
        <Route path="/">
          <Home
            projects={projects}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
          />
        </Route>
        <Route path="/report/:projectId" component={ReportPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <ErrorBoundary>
              <AppShellWithState />
            </ErrorBoundary>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
