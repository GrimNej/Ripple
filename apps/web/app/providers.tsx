"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

type ProvidersProperties = Readonly<{ children: ReactNode }>;

export function Providers({ children }: ProvidersProperties) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (count, error) =>
              error instanceof Error && "status" in error && Number(error.status) < 500
                ? false
                : count < 2,
            staleTime: 10_000,
          },
          mutations: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
