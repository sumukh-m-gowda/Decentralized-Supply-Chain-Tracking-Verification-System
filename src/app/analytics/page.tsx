"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty, ErrorMsg } from "@/components/Bits";
import { useApi } from "@/lib/client";

function Chart({ title, data, x, y, empty }: { title: string; data: any[]; x: string; y: string; empty: string }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {data.length ? <div style={{ height: 260 }}><ResponsiveContainer><BarChart data={data}>
        <CartesianGrid stroke="#e3e8ee" /><XAxis dataKey={x} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip />
        <Bar dataKey={y} fill="#0e6f68" />
      </BarChart></ResponsiveContainer></div> : <Empty>{empty}</Empty>}
    </div>
  );
}

export default function Analytics() {
  const { data, error } = useApi<any>("/api/stats");
  return (
    <>
      <h1>Analytics</h1>
      <ErrorMsg msg={error} />
      {data && (
        <div className="cols">
          <Chart title="Shipments by status" data={data.byStatus} x="status" y="count" empty="No shipments yet." />
          <Chart title="Alerts per day" data={data.alertsByDay} x="day" y="count" empty="No alerts yet." />
          <Chart title="Average transit hours by route" data={data.routes} x="route" y="avg_hours" empty="No delivered shipments yet." />
          <Chart title="Slow deliveries (over 72 hours) by sender" data={data.delayed} x="name" y="delayed" empty="No slow deliveries." />
        </div>
      )}
    </>
  );
}
