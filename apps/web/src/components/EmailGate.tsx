"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@yanabuy/web-kit";

/** Pages that work without a confirmed email. */
const OPEN = ["/verify-email", "/login", "/register", "/forgot-password"];

/** Sends anyone logged in without a confirmed email to "Confirm your email" first. */
export function EmailGate() {
  const { user } = useAuth();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (user?.needsVerification && !OPEN.some((p) => path.startsWith(p))) {
      router.replace(`/verify-email?next=${encodeURIComponent(path + window.location.search)}`);
    }
  }, [user, path, router]);
  return null;
}
