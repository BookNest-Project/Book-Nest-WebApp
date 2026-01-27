"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/AuthStore";

interface ProtectedReaderRouteProps {
  children: ReactNode;
}

export default function ProtectedReaderRoute({
  children,
}: ProtectedReaderRouteProps) {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const store: any = useAuthStore;
    const hasHydrated: boolean =
      store.persist && typeof store.persist.hasHydrated === "function"
        ? store.persist.hasHydrated()
        : false;

    if (!hasHydrated) {
      return;
    }

    if (!isAuthenticated || user?.role !== "reader") {
      router.replace("/login");
    } else {
      setIsReady(true);
    }
  }, [isAuthenticated, user, router]);

  if (!isReady) {
    return null;
  }

  return <>{children}</>;
}


