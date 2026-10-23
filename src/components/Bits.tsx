"use client";
import type { ReactNode } from "react";

export const Badge = ({ v }: { v: string }) => <span className={`badge ${v}`}>{v.replace(/_/g, " ")}</span>;
export const ErrorMsg = ({ msg }: { msg?: string }) => (msg ? <div className="error" role="alert">{msg}</div> : null);
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const Hash = ({ h }: { h?: string | null }) => <span className="mono" title={h ?? ""}>{h ? h.slice(0, 16) + "…" : "none (first event)"}</span>;
