import Link from "next/link";
import { Logo } from "@yanabuy/web-kit";

/** Two-column sign-in layout: brand panel on the left (desktop), form on the right. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-ink p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-amber" />
        <div className="absolute -bottom-32 left-16 h-[300px] w-[300px] rounded-full bg-purple-light" />
        <Link href="/" className="relative text-[20px]" aria-label="YanaBuy home">
          <Logo size={36} />
        </Link>
        <p className="relative max-w-sm font-display text-[42px] font-extrabold leading-[1.02] text-white">
          Buy, sell and order food — all on YanaBuy.
        </p>
      </div>
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[420px]">
          <Link href="/" className="mb-8 inline-block rounded-2xl bg-purple px-4 py-3 text-[17px] lg:hidden" aria-label="YanaBuy home">
            <Logo size={28} />
          </Link>
          <h1 className="font-display text-[32px] font-extrabold leading-tight">{title}</h1>
          <p className="mb-7 mt-1 text-[15px] text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
