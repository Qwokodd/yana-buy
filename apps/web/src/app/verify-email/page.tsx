"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EmailConfirm, useAuth } from "@yanabuy/web-kit";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";
import { nextPath } from "@/lib/next-url";

/** "Confirm your email" — every account needs a confirmed email (for receipts and updates). */
export default function VerifyEmailPage() {
  const { user, loading, setUser, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    else if (user && !user.needsEmail) router.replace(nextPath("/"));
  }, [loading, user, router]);

  if (!user) return null;
  return (
    <AuthShell
      title={user.email ? "Confirm your email" : "Add your email"}
      subtitle="We send your order updates, messages and receipts by email and text. Enter the 6-digit code we email you."
    >
      <EmailConfirm
        api={api}
        user={user}
        onDone={(u) => {
          setUser(u);
          router.replace(nextPath("/account"));
        }}
      />
      <button
        type="button"
        onClick={async () => {
          await logout();
          router.replace("/");
        }}
        className="mt-8 text-sm font-bold text-muted hover:underline"
      >
        Log out
      </button>
    </AuthShell>
  );
}
