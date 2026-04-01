/**
 * Lazy-loaded chart section for the Analytics Dashboard.
 * Separated into its own chunk so that recharts import failures
 * (e.g. Brave Shields, Edge tracking protection) don't crash the
 * stats / leaderboard which have no recharts dependency.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

const CHART_COLORS = [
  '#374151', '#e85d9c', '#e8a85d', '#5de8b8',
  '#6b7280', '#e85d5d', '#5da8e8', '#5de85d',
  '#e8d85d', '#d85de8',
];

function getModelColor(index) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function shortName(model) {
  return model?.split('/')[1] || model || 'unknown';
}

/**
 * Renders all chart sections for the analytics dashboard.
 * Expects pre-computed chart data as props.
 */
export default function AnalyticsCharts({
  winRateChartData,
  timeSeriesData,
  categoryChartData,
  leaderboard,
}) {
  return (
    <>
      {/* Win Rate Bar Chart */}
      {winRateChartData.length > 0 && (
        <div className="ad-section">
          <h2 className="ad-section-title">Win Rate by Model</h2>
          <div className="ad-chart-container" style={{ height: Math.max(280, winRateChartData.length * 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={winRateChartData} layout="vertical" margin={{ left: 120, right: 24, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft, #edf0f4)" />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [`${value}%`, 'Win Rate']}
                  contentStyle={{ borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', fontSize: 12 }}
                />
                <Bar dataKey="winRate" fill="var(--accent, #1a1a1a)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Performance Over Time */}
      {timeSeriesData.series.length > 1 && (
        <div className="ad-section">
          <h2 className="ad-section-title">Average Rank Over Time</h2>
          <p className="ad-section-subtitle">Lower rank = better performance (top 5 models shown)</p>
          <div className="ad-chart-container" style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeriesData.series} margin={{ left: 20, right: 24, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft, #edf0f4)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis reversed domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', fontSize: 12 }} />
                <Legend formatter={(value) => shortName(value)} />
                {timeSeriesData.models.map((model, i) => (
                  <Line
                    key={model}
                    type="monotone"
                    dataKey={model}
                    name={model}
                    stroke={getModelColor(i)}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {categoryChartData.length > 0 && (
        <div className="ad-section">
          <h2 className="ad-section-title">Performance by Category</h2>
          <p className="ad-section-subtitle">Win rate % across prompt categories (top 5 models)</p>
          <div className="ad-chart-container ad-chart-centered" style={{ height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={categoryChartData}>
                <PolarGrid stroke="var(--border-soft, #edf0f4)" />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                {(leaderboard || []).slice(0, 5).map((m, i) => (
                  <Radar
                    key={m.model}
                    name={shortName(m.model)}
                    dataKey={m.model}
                    stroke={getModelColor(i)}
                    fill={getModelColor(i)}
                    fillOpacity={0.15}
                  />
                ))}
                <Legend formatter={(value) => shortName(value)} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
