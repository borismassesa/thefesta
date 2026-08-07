import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { DashboardStats } from '@/types/dashboard';

const SIZE = 120;
const STROKE_WIDTH = 14;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Segment {
  key: string;
  label: string;
  count: number;
  color: string;
}

/** Mirrors apps/opus_pass/src/components/dashboard/AttendanceDonut.tsx's
 *  segment set and status colors (emerald/amber/rose/neutral). */
function buildSegments(stats: DashboardStats): Segment[] {
  return [
    { key: 'attending', label: 'Attending', count: stats.attending, color: '#2D8E5B' },
    { key: 'maybe', label: 'Maybe', count: stats.maybe, color: '#C4920A' },
    { key: 'declined', label: 'Declined', count: stats.declined, color: '#D85A30' },
    { key: 'pending', label: 'Awaiting', count: stats.pending, color: '#9CA3AF' },
  ];
}

export function AttendanceDonut({ stats }: { stats: DashboardStats }) {
  const segments = buildSegments(stats);
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  let cumulative = 0;

  return (
    <View className="flex-row items-center gap-5">
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {total === 0 ? (
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke="#E5E7EB"
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
          ) : (
            segments
              .filter((s) => s.count > 0)
              .map((s) => {
                const fraction = s.count / total;
                const length = fraction * CIRCUMFERENCE;
                const offset = CIRCUMFERENCE - cumulative;
                cumulative += length;
                return (
                  <Circle
                    key={s.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    stroke={s.color}
                    strokeWidth={STROKE_WIDTH}
                    strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                    strokeDashoffset={offset}
                    strokeLinecap="butt"
                    fill="none"
                    rotation={-90}
                    origin={`${SIZE / 2}, ${SIZE / 2}`}
                  />
                );
              })
          )}
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="font-inter-bold text-screen-title text-ed-on-surface">{stats.responseRate}%</Text>
          <Text className="font-inter text-label uppercase tracking-wide text-ed-on-surface-variant">
            answered
          </Text>
        </View>
      </View>

      <View className="flex-1 gap-2">
        {segments.map((s) => (
          <View key={s.key} className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <Text className="font-inter text-body-sm text-ed-on-surface-variant">{s.label}</Text>
            </View>
            <Text className="font-inter-semibold text-body-sm text-ed-on-surface">{s.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
