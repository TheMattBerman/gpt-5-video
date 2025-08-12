import type { AppProps } from "next/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Inter } from "next/font/google";
import "../styles/globals.css";
import { ToastProvider } from "../components/Toast";
import Layout from "../components/Layout";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <div className={inter.className}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </div>
      </ToastProvider>
    </QueryClientProvider>
  );
}
