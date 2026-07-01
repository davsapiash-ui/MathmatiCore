import React, { useMemo } from 'react';
import { Card, Title, Text, Grid, Metric, Flex, ProgressBar } from '@tremor/react';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { ResponsiveRadar } from '@nivo/radar';
import SessionReplayViewer from '../components/teacher/SessionReplayViewer';
import AIAuditPanel from '../components/teacher/AIAuditPanel';
import MicroScaffoldingPanel from '../components/teacher/MicroScaffoldingPanel';

const HEATMAP_DATA = [
  {
    "id": "חיבור וחיסור",
    "data": [
      { "x": "1-5", "y": 90 },
      { "x": "6-10", "y": 75 },
      { "x": "11-20", "y": 45 }
    ]
  },
  {
    "id": "המרת עשרות",
    "data": [
      { "x": "1-5", "y": 80 },
      { "x": "6-10", "y": 50 },
      { "x": "11-20", "y": 20 }
    ]
  }
];

const RADAR_DATA = [
  { "skill": "המרת עשרות", "יוסי": 80, "כיתה": 65 },
  { "skill": "זיהוי כמות", "יוסי": 95, "כיתה": 85 },
  { "skill": "פעולות חיבור", "יוסי": 70, "כיתה": 75 },
  { "skill": "פעולות חיסור", "יוסי": 50, "כיתה": 60 },
  { "skill": "הבנת רצף", "יוסי": 85, "כיתה": 70 }];

const MOCK_DATA = [
  { id: 1, name: 'יוסי כהן', grade: 'א', struggles: 2, level: 'מתקדם' },
  { id: 2, name: 'מיכל לוי', grade: 'א', struggles: 5, level: 'זקוק לעזרה' },
  { id: 3, name: 'דני טל', grade: 'א', struggles: 0, level: 'מצוין' },
];

export default function TeacherDashboard() {
  const columns = useMemo(() => [
    { header: 'שם התלמיד', accessorKey: 'name' },
    { header: 'כיתה', accessorKey: 'grade' },
    { header: 'אירועי מאבק (ASD)', accessorKey: 'struggles' },
    { header: 'רמה קוגניטיבית', accessorKey: 'level' },
  ], []);

  const table = useReactTable({
    data: MOCK_DATA,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="p-6 bg-slate-50 min-h-screen" dir="rtl">
      <Title className="text-3xl font-bold mb-6 text-slate-800">דשבורד מורה (Tremor + TanStack)</Title>
      
      {/* KPIs using Tremor */}
      <Grid numItemsMd={2} numItemsLg={3} className="gap-6 mb-8">
        <Card decoration="top" decorationColor="indigo">
          <Text>סה"כ תלמידים פעילים</Text>
          <Metric>32</Metric>
        </Card>
        <Card decoration="top" decorationColor="amber">
          <Text>אירועי היסוס היום</Text>
          <Metric>14</Metric>
        </Card>
        <Card decoration="top" decorationColor="emerald">
          <Text>אחוזי הצלחה כיתתיים</Text>
          <Metric>78%</Metric>
          <ProgressBar value={78} color="emerald" className="mt-3" />
        </Card>
      </Grid>

      {/* TanStack Table inside a Tremor Card */}
      <Card>
        <Title className="mb-4">טבלת מעקב תלמידים (Headless Table)</Title>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="border-b border-slate-200">
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="p-4 font-semibold text-slate-600 bg-slate-100/50">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="p-4 text-slate-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {/* Nivo Charts Section */}
      <Grid numItemsMd={1} numItemsLg={2} className="gap-6 mt-8">
        <Card>
          <Title className="mb-4">מפת חום של נקודות תורפה (Q-Matrix)</Title>
          <div className="h-72 w-full">
            <ResponsiveHeatMap
              data={HEATMAP_DATA}
              keys={['1-5', '6-10', '11-20']}
              indexBy="id"
              margin={{ top: 20, right: 60, bottom: 20, left: 60 }}
              colors={{
                type: 'sequential',
                scheme: 'yellow_or_red',
              }}
              axisTop={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: '',
                legendOffset: 46
              }}
              axisRight={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: 'נושא',
                legendPosition: 'middle',
                legendOffset: 40
              }}
              emptyColor="#555555"
              borderColor={{ from: 'color', modifiers: [['darker', 0.4]] }}
              labelTextColor={{ from: 'color', modifiers: [['darker', 1.8]] }}
              animate={true}
              motionConfig="wobbly"
              hoverTarget="cell"
              cellHoverOthersOpacity={0.25}
              theme={{
                tooltip: {
                  container: {
                    background: '#1f2937',
                    color: '#f9fafb',
                    fontSize: '14px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }
                }
              }}
            />
          </div>
        </Card>

        <Card>
          <Title className="mb-4">פרופיל מיומנויות תלמיד מול כיתה</Title>
          <div className="h-72 w-full">
            <ResponsiveRadar
              data={RADAR_DATA}
              keys={['יוסי', 'כיתה']}
              indexBy="skill"
              maxValue="auto"
              margin={{ top: 40, right: 80, bottom: 40, left: 80 }}
              curve="linearClosed"
              borderWidth={2}
              borderColor={{ from: 'color' }}
              gridLevels={5}
              gridShape="circular"
              gridLabelOffset={36}
              enableDots={true}
              dotSize={10}
              dotColor={{ theme: 'background' }}
              dotBorderWidth={2}
              dotBorderColor={{ from: 'color' }}
              enableDotLabel={false}
              colors={{ scheme: 'category10' }}
              fillOpacity={0.25}
              blendMode="multiply"
              animate={true}
              motionConfig="wobbly"
              isInteractive={true}
              theme={{
                tooltip: {
                  container: {
                    background: '#1f2937',
                    color: '#f9fafb',
                    fontSize: '14px',
                  }
                }
              }}
            />
          </div>
        </Card>
      </Grid>
      
      {/* 60/40 Split Layout: Replay Theater & Audit Hub */}
      <div className="mt-8 grid grid-cols-1 xl:grid-cols-12 gap-6 bg-slate-950 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        {/* Left Side: Replay Theater (60% -> 7 columns out of 12) */}
        <div className="xl:col-span-7 flex flex-col">
          <Title className="mb-4 text-slate-100 text-2xl">במת שחזור (Session Replay Theater)</Title>
          <Text className="mb-6 text-slate-400">צפה בשחזור מלא של פעולות התלמיד. ציר הזמן החכם מציג אזורי מאבק קוגניטיבי.</Text>
          <SessionReplayViewer 
            events={[
              { time: 0, type: 'mousemove', x: 100, y: 100 },
              { time: 500, type: 'mousemove', x: 150, y: 150 },
              { time: 1000, type: 'mousemove', x: 200, y: 200 },
              { time: 1200, type: 'click', x: 200, y: 200 },
              { time: 1500, type: 'mousemove', x: 300, y: 250 },
              { time: 2000, type: 'mousemove', x: 350, y: 300 },
              { time: 2200, type: 'click', x: 350, y: 300 },
            ]} 
            duration={3000} 
          />
        </div>

        {/* Right Side: Audit & Action Hub (40% -> 5 columns out of 12) */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          <AIAuditPanel />
          <MicroScaffoldingPanel />
        </div>
      </div>
    </div>
  );
}
