import type { AppProps } from "next/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
// Inter font is optional and can be added later if desired
import "../styles/globals.css";
import { ToastProvider } from "../components/Toast";
import Layout from "../components/Layout";

// const inter = Inter({ subsets: ["latin"], display: "swap" });

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </ToastProvider>
    </QueryClientProvider>
  );
}
