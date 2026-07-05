import React, { useState, useEffect, useMemo } from 'react';
import { getValidToken } from '../services/googleAuth';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#29A9E0', '#3DAA72', '#FAB931', '#F05731', '#353750', '#9B51E0', '#2D9CDB', '#F2C94C', '#EB5757', '#27AE60'];

function SpreadsheetDashboard({ spreadsheetId, title }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('ALL');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const token = await getValidToken();
        const authHead = { Authorization: `Bearer ${token}` };

        // 1. Get Spreadsheet Metadata to find the first sheet name
        const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers: authHead });
        if (!metaRes.ok) throw new Error('Failed to access the spreadsheet. Please ensure your Google account has View access to it.');
        const metaData = await metaRes.json();
        
        const firstSheetTitle = metaData.sheets[0]?.properties?.title;
        if (!firstSheetTitle) throw new Error('No sheets found in the document.');

        // 2. Fetch the data from the first sheet
        const dataRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(firstSheetTitle)}`, { headers: authHead });
        if (!dataRes.ok) throw new Error('Failed to fetch data from the sheet.');
        const sheetData = await dataRes.json();

        const rows = sheetData.values || [];
        if (rows.length < 2) throw new Error('Not enough data found in the sheet (need headers + at least 1 row).');

        const parsedHeaders = rows[0];
        setHeaders(parsedHeaders);

        // Convert 2D array to array of objects
        const parsedData = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const obj = {};
          parsedHeaders.forEach((header, idx) => {
            obj[header] = row[idx] || '';
          });
          parsedData.push(obj);
        }
        setData(parsedData);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [spreadsheetId]);

  // Extract available months from the date column
  const availableMonths = useMemo(() => {
    if (!data.length || !headers.length) return [];
    
    // Find the date column (Timestamp, Tanggal, Date, etc.)
    const dateHeader = headers.find(h => 
      h.toLowerCase().includes('timestamp') || 
      h.toLowerCase().includes('tanggal') || 
      h.toLowerCase().includes('date') ||
      h.toLowerCase().includes('waktu')
    );

    if (!dateHeader) return [];

    const months = new Set();
    data.forEach(row => {
      if (row[dateHeader]) {
        try {
          // Parse date string (assumes standard formats or ISO)
          const d = new Date(row[dateHeader]);
          if (!isNaN(d.getTime())) {
            const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            months.add(monthStr);
            // Attach parsed month back to the row for easy filtering later
            row._parsedMonth = monthStr;
          }
        } catch (e) {
          // ignore parsing errors
        }
      }
    });

    return Array.from(months).sort((a, b) => new Date(b) - new Date(a));
  }, [data, headers]);

  // Apply filter
  const filteredData = useMemo(() => {
    if (selectedMonth === 'ALL') return data;
    return data.filter(row => row._parsedMonth === selectedMonth);
  }, [data, selectedMonth]);

  // Analyze columns to find categorical data for charts (unique values > 1 and <= 20)
  const chartsData = useMemo(() => {
    if (!filteredData.length || !headers.length) return [];

    const categoricalColumns = [];
    headers.forEach(header => {
      // Skip obvious non-categorical columns
      if (header.toLowerCase().includes('timestamp') || header.toLowerCase().includes('id') || header.toLowerCase().includes('name') || header.toLowerCase().includes('email')) {
        return;
      }

      const uniqueValues = new Set();
      filteredData.forEach(row => {
        if (row[header] && String(row[header]).trim() !== '') {
          uniqueValues.add(row[header]);
        }
      });
      
      // If it's a good categorical column (like Department, Status, Rule Type)
      if (uniqueValues.size > 1 && uniqueValues.size <= 20) {
        // Count occurrences
        const counts = {};
        filteredData.forEach(row => {
          let val = row[header] || 'Unknown/Blank';
          if (String(val).trim() === '') val = 'Unknown/Blank';
          counts[val] = (counts[val] || 0) + 1;
        });
        
        // Format for recharts
        const chartData = Object.keys(counts).map(key => ({
          name: key,
          value: counts[key]
        })).sort((a, b) => b.value - a.value);

        categoricalColumns.push({ header, chartData });
      }
    });

    return categoricalColumns.slice(0, 4); // Limit to top 4 best charts
  }, [filteredData, headers]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
        <span className="material-symbols-outlined text-[#F05731] text-4xl animate-spin mb-4">autorenew</span>
        <h2 className="text-[#353750] font-bold uppercase tracking-widest text-sm">Loading Data...</h2>
        <p className="text-[#6B6E8A] text-xs mt-2">Connecting to Google Spreadsheet</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex flex-col items-center text-center max-w-lg mx-auto mt-10">
          <span className="material-symbols-outlined text-4xl mb-2">error</span>
          <h2 className="font-bold text-lg mb-1">Access Error</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header & Filter */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-bold text-[#353750] uppercase text-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-[#F05731] text-2xl">insert_chart</span>
            {title} Data
          </h2>
          <p className="text-sm text-[#6B6E8A] mt-1">Live data feed</p>
        </div>

        {availableMonths.length > 0 && (
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-[#6B6E8A] uppercase tracking-wider mb-1">Filter By Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 bg-white border border-[#E0E0EC] rounded-lg text-sm font-bold text-[#353750] shadow-sm hover:border-gray-400 focus:outline-none transition-colors"
            >
              <option value="ALL">All Time</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Auto-Generated Charts */}
      {chartsData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {chartsData.map((col, idx) => (
            <div key={col.header} className="bg-white border border-[#E0E0EC] rounded-xl shadow-sm p-4 flex flex-col">
              <h3 className="text-[#353750] font-bold text-sm uppercase tracking-wider mb-4 border-b border-[#E0E0EC] pb-2">
                {col.header} Breakdown
              </h3>
              <div className="h-64 w-full">
                {idx % 2 === 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={col.chartData} margin={{ top: 5, right: 30, left: 0, bottom: 30 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={60} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip cursor={{ fill: '#F4F4F6' }} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                      <Bar dataKey="value" fill="#29A9E0" radius={[4, 4, 0, 0]} name="Count">
                        {col.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={col.chartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {col.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw Data Table */}
      <div className="bg-white border border-[#E0E0EC] rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#E0E0EC]">
          <h3 className="text-[#353750] font-bold text-sm uppercase tracking-wider">Recent Submissions ({filteredData.length})</h3>
        </div>
        <div className="overflow-x-auto max-h-[400px]">
          <table className="w-full text-left text-xs text-[#353750] whitespace-nowrap">
            <thead className="bg-[#F4F4F6] sticky top-0 shadow-sm z-10">
              <tr>
                {headers.map(h => (
                  <th key={h} className="px-4 py-3 font-bold uppercase tracking-wider border-b border-[#E0E0EC]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0EC]">
              {filteredData.slice().reverse().slice(0, 100).map((row, idx) => (
                <tr key={idx} className="hover:bg-[#F9F9FB] transition-colors">
                  {headers.map(h => (
                    <td key={h} className="px-4 py-3 truncate max-w-[200px]">{row[h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SafetyDashboard() {
  const [activeTab, setActiveTab] = useState('LSR');

  const DASHBOARDS = [
    {
      id: 'LSR',
      title: 'Life Saving Rules',
      spreadsheetId: '1_q3qYuSkI50i0pqBnG9H0yU5c4Nu-SM5bKcmvG-VqLQ'
    },
    {
      id: 'COMM_CARD',
      title: 'Communication Card',
      spreadsheetId: '1MDSs0T_jgodb7hhGqfhgYgzcIykue59HG_RY7zQIRHk'
    }
  ];

  const currentDashboard = DASHBOARDS.find(d => d.id === activeTab);

  return (
    <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto pb-32 w-full" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-[#353750] uppercase text-xl md:text-2xl flex items-center gap-2">
          <span className="material-symbols-outlined text-[#F05731] text-3xl">health_and_safety</span>
          Safety Dashboards
        </h1>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-[#E0E0EC] pb-4">
        {DASHBOARDS.map(dashboard => (
          <button
            key={dashboard.id}
            onClick={() => setActiveTab(dashboard.id)}
            className={`px-4 py-2 rounded-full text-xs md:text-sm font-bold uppercase tracking-wider transition-colors ${
              activeTab === dashboard.id
                ? 'bg-[#353750] text-white'
                : 'bg-white text-[#6B6E8A] border border-[#E0E0EC] hover:bg-[#F4F4F6]'
            }`}
          >
            {dashboard.title}
          </button>
        ))}
      </div>

      {/* Render Active Dashboard */}
      <SpreadsheetDashboard
        key={currentDashboard.id} // Important: force remount when tab changes so state resets
        spreadsheetId={currentDashboard.spreadsheetId}
        title={currentDashboard.title}
      />
    </div>
  );
}
