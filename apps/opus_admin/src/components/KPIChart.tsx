import { Calendar } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { name: "Jan", value: 40 },
  { name: "Feb", value: 30 },
  { name: "Mar", value: 55 },
  { name: "Apr", value: 65 },
  { name: "May", value: 50 },
  { name: "Jun", value: 55 },
  { name: "Jul", value: 52 },
  { name: "Aug", value: 35 },
  { name: "Sep", value: 50 },
  { name: "Oct", value: 52 },
  { name: "Nov", value: 45 },
  { name: "Dec", value: 60 },
];

export function KPIChart() {
  return (
    <div className="bg-white p-6 justify-between flex flex-col rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] w-full h-full">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h3 className="text-[15px] font-medium text-gray-900 mb-4">KPI Performance</h3>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-semibold text-gray-900 tracking-tight">91.72%</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
              +24%
            </span>
            <span className="text-xs text-gray-400 font-medium tracking-wide">vs last month</span>
          </div>
        </div>
        
        <button data-opus-button="control" className="flex items-center gap-2 border border-gray-200 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <Calendar className="w-4 h-4 text-gray-400" />
          Last Year
          <svg className="w-4 h-4 text-gray-400 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
      </div>

      <div className="h-64 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorKpi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C9A0DC" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#C9A0DC" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#9ca3af', fontSize: 13, fontWeight: 500 }} 
              padding={{ left: 10, right: 10 }}
              dy={10}
            />
            <Tooltip
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
            />
            <Area
              type="step"
              dataKey="value"
              stroke="#C9A0DC"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorKpi)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
