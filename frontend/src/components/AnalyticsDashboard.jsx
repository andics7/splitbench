import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { api } from '../api';
import './AnalyticsDashboard.css';

function shortModelName(model) {
  return model?.split('/')[1] || model || 'unknown';
}

function formatCost(cost) {
  if (cost == null || cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

const CHART_COLORS = [
  '#374151', '#e85d9c', '#e8a85d', '#5de8b8',
  '#6b7280', '#e85d5d', '#5da8e8', '#5de85d',
  '#e8d85d', '#d85de8',
];

function getModelColor(index) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function StatCard({ label, value, sublabel }) {
  return (
    <div className="ad-stat-card">
      <div className="ad-stat-value">{value}</div>
      <div className="ad-stat-label">{label}</div>
      {sublabel && <div className="ad-stat-sublabel">{sublabel}</div>}
    </div>
  );
}

function MedalIndicator({ rank }) {
  if (rank === 1) return <span className="ad-medal ad-medal-gold">1st</span>;
  if (rank === 2) return <span className="ad-medal ad-medal-silver">2nd</span>;
  if (rank === 3) return <span className="ad-medal ad-medal-bronze">3rd</span>;
  return <span className="ad-rank">#{rank}</span>;
}

function SortArrow({ column, sortColumn, sortDirection }) {
  if (column !== sortColumn) return null;
  return <span className="ad-sort-arrow">{sortDirection === 'desc' ? ' \u25BC' : ' \u25B2'}</span>;
}

const TIME_RANGES = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: 'All', value: null },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'creative-writing', label: 'Creative' },
  { id: 'coding', label: 'Coding' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'custom', label: 'Custom' },
  { id: 'uncategorized', label: 'Other' },
];

export default function AnalyticsDashboard({ onBackToChat }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTimeRange, setSelectedTimeRange] = useState(null);
  const [sortColumn, setSortColumn] = useState('win_rate');
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    fetchAnalytics();
  }, [selectedCategory, selectedTimeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAnalytics(
        selectedCategory !== 'all' ? selectedCategory : null,
        selectedTimeRange,
      );
      setData(result);
    } catch (err) {
      setError('Failed to load analytics data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sortedLeaderboard = useMemo(() => {
    if (!data?.leaderboard) return [];
    const sorted = [...data.leaderboard];
    sorted.sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (sortColumn === 'model') {
        const aName = shortModelName(aVal);
        const bName = shortModelName(bVal);
        return sortDirection === 'asc'
          ? aName.localeCompare(bName)
          : bName.localeCompare(aName);
      }
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [data?.leaderboard, sortColumn, sortDirection]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortColumn(column);
      setSortDirection(column === 'avg_rank' ? 'asc' : 'desc');
    }
  };

  const winRateChartData = useMemo(() => {
    if (!data?.leaderboard) return [];
    return data.leaderboard
      .filter((m) => m.times_tested > 0)
      .sort((a, b) => b.win_rate - a.win_rate)
      .slice(0, 10)
      .map((m) => ({
        name: shortModelName(m.model),
        winRate: m.win_rate,
      }));
  }, [data?.leaderboard]);

  const timeSeriesData = useMemo(() => {
    if (!data?.time_series || !data?.leaderboard) return { series: [], models: [] };
    const top5Models = data.leaderboard.slice(0, 5).map((m) => m.model);
    return { series: data.time_series, models: top5Models };
  }, [data?.time_series, data?.leaderboard]);

  const categoryChartData = useMemo(() => {
    if (!data?.category_breakdown || !data?.leaderboard) return [];
    const top5Models = data.leaderboard.slice(0, 5).map((m) => m.model);
    const categories = Object.keys(data.category_breakdown);
    if (categories.length < 2) return [];
    return categories.map((cat) => {
      const entry = { category: cat };
      for (const model of top5Models) {
        const modelData = data.category_breakdown[cat]?.find((m) => m.model === model);
        entry[model] = modelData ? modelData.win_rate : 0;
      }
      return entry;
    });
  }, [data?.category_breakdown, data?.leaderboard]);

  return (
    <div className="ad-dashboard">
      {/* Header */}
      <div className="ad-header">
        <div className="ad-header-left">
          <button className="ad-back-btn" onClick={onBackToChat} type="button" title="Back to chat">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="ad-title">Model Analytics</h1>
          {data && data.total_evaluations > 0 && (
            <span className="ad-session-badge">
              {data.total_evaluations} session{data.total_evaluations !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="ad-header-filters">
          <div className="ad-filter-group">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`ad-filter-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
                type="button"
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="ad-filter-group">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.label}
                className={`ad-filter-btn ${selectedTimeRange === tr.value ? 'active' : ''}`}
                onClick={() => setSelectedTimeRange(tr.value)}
                type="button"
              >
                {tr.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="ad-loading">
          <div className="ad-spinner" />
          <span>Loading analytics...</span>
        </div>
      ) : error ? (
        <div className="ad-error">{error}</div>
      ) : !data || data.total_evaluations === 0 ? (
        <div className="ad-empty">
          <div className="ad-empty-icon">
            <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
              <rect x="8" y="28" width="8" height="12" rx="2" fill="var(--border)" />
              <rect x="20" y="16" width="8" height="24" rx="2" fill="var(--border)" />
              <rect x="32" y="8" width="8" height="32" rx="2" fill="var(--border)" />
            </svg>
          </div>
          <h2>No analytics data yet</h2>
          <p>Run some council evaluations to start seeing model performance data here.</p>
          <button className="ad-btn-primary" onClick={onBackToChat} type="button">
            Start a conversation
          </button>
        </div>
      ) : (
        <div className="ad-content">
          {/* Summary Stats */}
          <div className="ad-stats-row">
            <StatCard label="Total Evaluations" value={data.total_evaluations} />
            <StatCard label="Models Tested" value={data.unique_models} />
            <StatCard
              label="Top Performer"
              value={data.top_model ? shortModelName(data.top_model.model) : '--'}
              sublabel={data.top_model ? `${data.top_model.win_rate}% win rate` : undefined}
            />
            <StatCard label="Total Cost" value={formatCost(data.total_cost)} />
          </div>

          {/* Leaderboard */}
          <div className="ad-section">
            <h2 className="ad-section-title">Model Leaderboard</h2>
            <div className="ad-table-wrapper">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th className="ad-th-rank">Rank</th>
                    <th className="ad-th-sortable" onClick={() => handleSort('model')}>
                      Model<SortArrow column="model" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th className="ad-th-sortable" onClick={() => handleSort('win_rate')}>
                      Win Rate<SortArrow column="win_rate" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th className="ad-th-sortable" onClick={() => handleSort('avg_rank')}>
                      Avg Rank<SortArrow column="avg_rank" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th className="ad-th-sortable" onClick={() => handleSort('times_tested')}>
                      Tested<SortArrow column="times_tested" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th className="ad-th-sortable" onClick={() => handleSort('first_place_votes')}>
                      1st Place<SortArrow column="first_place_votes" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                    <th className="ad-th-sortable" onClick={() => handleSort('total_cost')}>
                      Cost<SortArrow column="total_cost" sortColumn={sortColumn} sortDirection={sortDirection} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLeaderboard.map((model, index) => (
                    <tr key={model.model} className="ad-table-row">
                      <td><MedalIndicator rank={index + 1} /></td>
                      <td className="ad-model-name">{shortModelName(model.model)}</td>
                      <td className="ad-num">{model.win_rate}%</td>
                      <td className="ad-num">{model.avg_rank}</td>
                      <td className="ad-num">{model.times_tested}</td>
                      <td className="ad-num">{model.first_place_votes}</td>
                      <td className="ad-num">{formatCost(model.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Win Rate Bar Chart */}
          {winRateChartData.length > 0 && (
            <div className="ad-section">
              <h2 className="ad-section-title">Win Rate by Model</h2>
              <div className="ad-chart-container">
                <ResponsiveContainer width="100%" height={Math.max(280, winRateChartData.length * 40)}>
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
              <div className="ad-chart-container">
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={timeSeriesData.series} margin={{ left: 20, right: 24, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft, #edf0f4)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis reversed domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', fontSize: 12 }} />
                    <Legend formatter={(value) => shortModelName(value)} />
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
              <div className="ad-chart-container ad-chart-centered">
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={categoryChartData}>
                    <PolarGrid stroke="var(--border-soft, #edf0f4)" />
                    <PolarAngleAxis dataKey="category" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    {(data?.leaderboard || []).slice(0, 5).map((m, i) => (
                      <Radar
                        key={m.model}
                        name={shortModelName(m.model)}
                        dataKey={m.model}
                        stroke={getModelColor(i)}
                        fill={getModelColor(i)}
                        fillOpacity={0.15}
                      />
                    ))}
                    <Legend formatter={(value) => shortModelName(value)} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
