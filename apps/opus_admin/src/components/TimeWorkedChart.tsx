import { Calendar } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, XAxis, Tooltip, Dot } from "recharts";

const data = [
  { name: "", value: 10 },
  { name: "", value: 15 },
  { name: "", value: 25 },
  { name: "", value: 18 },
  { name: "Nov 02, 2024", value: 35, dot: true },
  { name: "", value: 20 },
  { name: "", value: 28 },
  { name: "", value: 25 },
  { name: "", value: 32 },
];

const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload.dot) {
    return (
      <svg x={cx - 5} y={cy - 5} width={10} height={10} viewBox="0 0 10 10">
        <circle cx={5} cy={5} r={4} fill="#fff" stroke="#C9A0DC" strokeWidth={2} />
      </svg>
    );
  }
  return null;
};

export function TimeWorkedChart() {
  return (
    <div className="bg-white p-6 justify-between flex flex-col rounded-2xl border border-gray-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] w-full">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-medium text-gray-900 mb-4">Total Time Worked</h3>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-3xl font-semibold text-gray-900 tracking-tight">12hr 32min</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">
              +12%
            </span>
            <span className="text-xs text-gray-400 font-medium tracking-wide">vs last month</span>
          </div>
        </div>
        
        <button data-opus-button="control" className="flex items-center gap-2 border border-gray-200 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <Calendar className="w-4 h-4 text-gray-400" />
          Weekly View
          <svg className="w-4 h-4 text-gray-400 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
      </div>

      <div className="h-32 w-full mt-2 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C9A0DC" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#C9A0DC" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              cursor={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#C9A0DC"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#colorTime)"
              activeDot={<CustomDot />}
              dot={<CustomDot />}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div className="flex justify-between items-center text-xs font-medium text-gray-500 mt-2 px-1">
         <span>Nov 02, 2024</span>
         <span>198hr 46min Total Time</span>
      </div>
    </div>
  );
}

