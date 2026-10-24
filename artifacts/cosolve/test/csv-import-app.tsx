// Bundled only by the CSV browser test; never an application entry point.
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AppShell } from "../src/pages/workspace";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })}>
    <ThemeProvider><AppShell /></ThemeProvider>
  </QueryClientProvider>,
);
