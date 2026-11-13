"use client";
import { type ReactNode } from "react";
import { toast } from "sonner";

export function avisar(texto: string, tipo: "ok" | "error" = "ok") {
  if (tipo === "error") toast.error(texto); else toast.success(texto);
}

export function Boton({ children, onClick, tipo = "normal", disabled, className = "", type = "button", title, href, pequeno }: {
  children: ReactNode; onClick?: () => void; tipo?: "normal" | "primario" | "fantasma" | "peligro"; disabled?: boolean; className?: string; type?: "button" | "submit"; title?: string; href?: string; pequeno?: boolean;
}) {
  const t = {
    normal: "border border-borde bg-card text-txt hover:border-acento/50 hover:bg-acento-suave/40",
    primario: "degradado text-white shadow-[0_6px_20px_-6px_rgba(161,28,240,.6)] hover:brightness-110",
    fantasma: "text-txt-2 hover:bg-acento-suave/60 hover:text-txt",
    peligro: "border border-mal/40 text-mal hover:bg-mal-suave",
  }[tipo];
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${pequeno ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-sm"} ${t} ${className}`;
  if (href) return <a href={href} className={cls} title={title} onClick={onClick}>{children}</a>;
  return <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>{children}</button>;
}

export function Campo({ etiqueta, children, ayuda, className = "" }: { etiqueta: string; children: ReactNode; ayuda?: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-txt-2">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] leading-snug text-txt-3">{ayuda}</span>}
    </label>
  );
}

export function Tarjeta({ titulo, extra, children, className = "", sub }: { titulo?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-borde bg-card p-4 sm:p-5 ${className}`}>
      {(titulo || extra) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h2 className="font-display text-[15px] font-semibold text-txt">{titulo}</h2>}
            {sub && <p className="mt-0.5 text-xs text-txt-3">{sub}</p>}
          </div>
          {extra && <div className="flex shrink-0 items-center gap-2">{extra}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Insignia({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | "bien" | "aviso" | "mal" | "acento" }) {
  const t = { neutro: "bg-card-2 text-txt-2 border-borde", bien: "bg-bien-suave text-bien border-bien/20", aviso: "bg-aviso-suave text-aviso border-aviso/20", mal: "bg-mal-suave text-mal border-mal/20", acento: "bg-acento-suave text-acento border-acento/20" }[tono];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

export const ESTADOS: Record<string, { txt: string; tono: "neutro" | "bien" | "aviso" | "mal" | "acento" }> = {
  borrador: { txt: "Borrador", tono: "neutro" },
  enviado: { txt: "Enviado", tono: "acento" },
  aceptado: { txt: "Aceptado", tono: "bien" },
  rechazado: { txt: "Rechazado", tono: "mal" },
};

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-txt-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-acento border-t-transparent" />
      {texto}
    </div>
  );
}

