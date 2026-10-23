"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SerialForm() {
  const [v, setV] = useState("");
  const router = useRouter();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) router.push(`/verify/${encodeURIComponent(v.trim())}`); }}>
      <input aria-label="Serial number" placeholder="Serial number, for example SN-000123" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn" type="submit">Check item</button>
    </form>
  );
}
