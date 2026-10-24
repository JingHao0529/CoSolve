import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ThemeProvider } from 'next-themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/pages/workspace';
import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#2C6A63',
    colorForeground: '#1F2E30',
    colorMutedForeground: '#687571',
    colorBackground: '#FFFDF8',
    colorInput: '#F4F1EA',
    colorInputForeground: '#1F2E30',
    colorNeutral: '#E4DDCF',
    fontFamily: 'Plus Jakarta Sans',
    borderRadius: '8px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#FFFDF8] rounded-xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#1F2E30]',
    headerSubtitle: 'text-[#687571]',
    formFieldLabel: 'text-[#546466]',
    footerActionLink: 'text-[#2C6A63]',
    formButtonPrimary: 'bg-[#2C6A63] hover:bg-[#21524C]',
  },
};

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <AppShell />
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const prevUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (prevUserId.current !== undefined && prevUserId.current !== userId) {
      queryClient.clear();
    }
    prevUserId.current = userId;
  }), [addListener]);

  return null;
}

function SignInPage() {
  return (
    <div className="min-h-[100dvh] bg-paper px-4 py-8 flex flex-col items-center justify-center gap-5">
      <Link href="/" className="display text-2xl text-ink">CoSolve</Link>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-[100dvh] bg-paper px-4 py-8 flex flex-col items-center justify-center gap-5">
      <Link href="/" className="display text-2xl text-ink">CoSolve</Link>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function SignedOutLanding() {
  return (
    <main className="min-h-[100dvh] bg-paper px-5 py-12 flex items-center justify-center">
      <section className="w-full max-w-xl text-center">
        <Link href="/" className="display text-3xl text-ink">CoSolve</Link>
        <p className="eyebrow mt-8">Customer support workspace</p>
        <h1 className="display text-4xl md:text-5xl leading-tight mt-3">
          Better resolutions start with a clear view.
        </h1>
        <p className="text-ink-soft text-base md:text-lg leading-relaxed mt-4">
          Complaint and customer records are available to signed-in CoSolve staff.
          Sign in to open your workspace or create an account to get started.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          <Link href="/sign-in" className="btn-primary inline-flex items-center justify-center px-5 py-3 text-sm">
            Sign in to CoSolve
          </Link>
          <Link href="/sign-up" className="btn-quiet inline-flex items-center justify-center px-5 py-3 text-sm">
            Create an account
          </Link>
        </div>
      </section>
    </main>
  );
}

function AuthenticatedWorkspace() {
  const { isLoaded, user } = useUser();

  if (!isLoaded) {
    return (
      <main className="min-h-[100dvh] bg-paper px-5 flex items-center justify-center">
        <p className="text-sm text-ink-soft" role="status">Checking your sign-in…</p>
      </main>
    );
  }

  return user ? <Router /> : <SignedOutLanding />;
}

function ClerkAppRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your workspace' } },
        signUp: { start: { title: 'Create your CoSolve account', subtitle: 'Join your customer support workspace' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route><AuthenticatedWorkspace /></Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="cosolve-theme" disableTransitionOnChange>
      <WouterRouter base={basePath}>
        <ClerkAppRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;
