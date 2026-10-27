import { useEffect, useState } from 'react';
import { Heading, SimpleGrid, Spinner, Text, VStack } from '@chakra-ui/react';
import { authFetch } from './authFetch';
import SimpleBarChart from './SimpleBarChart';
import { ChartCard, HBarChart, Heatmap, KpiTile, LineChart, StackedBar } from './AnalyticsCharts';
import type { HeatmapData, LV } from './AnalyticsCharts';
import { AppealsByReason } from './AnalyticsTables';
import type { AppealRow } from './AnalyticsTables';
import { useColorModeValue } from '@chakra-ui/react';

interface Data {
  outcomes: {
    requests: number; completed: number; upcoming: number; declined: number; studentNoShows: number; missedByFaculty: number;
    cancelledByStudent: number; cancelledByFaculty: number; completionRate: number | null; missedRate: number | null; approvalRate: number | null;
  };
  weekly: LV[];
  monthly: LV[];
  heatmap: HeatmapData;
  appeals: { summary: { appealRate: number | null; accepted: number; rejected: number; acceptanceRate: number | null; faculty: { made: number; accepted: number; rejected: number } }; rows: AppealRow[]; reasons: string[] };
  students: { uniqueStudents: number; byProgram: LV[]; byYear: LV[]; purposes: { total: number; items: { label: string; count: number; percent: number }[] } };
}

const pctText = (n: number | null) => (n === null ? '—' : `${n}%`);

// A faculty member's own analytics. The server only ever returns the logged-in faculty's data.
export default function FacultyAnalytics() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const text = useColorModeValue('#0f2240', '#e8f0fe');
  const muted = useColorModeValue('#6b7fa0', '#7a93b0');

  useEffect(() => {
    authFetch(`${import.meta.env.VITE_API_URL}/api/analytics/me`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then(setData)
      .catch((e: any) => setError(e.message || 'Could not load your analytics.'));
  }, []);

  if (error) return <Text color="red.500">{error}</Text>;
  if (!data) return <Spinner />;
  const { outcomes: o, students: s, appeals } = data;

  return (
    <VStack align="stretch" spacing={6}>
      <Heading size="md" color={text}>My Analytics</Heading>

      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
        <KpiTile label="Requests" value={o.requests} sub={`${s.uniqueStudents} different students`} accent="#2563eb" hint="Requests you reviewed or that happened. Requests still waiting for your answer are not counted." />
        <KpiTile label="Completed" value={o.completed} sub={`completion rate ${pctText(o.completionRate)}`} accent="#16a34a" hint="Completion rate = completed ÷ (completed + missed)." />
        <KpiTile label="Student no-shows" value={o.studentNoShows} sub={`missed rate ${pctText(o.missedRate)}`} accent="#f08a3c" hint="Appeals never reduce this number." />
        <KpiTile label="Approval rate" value={pctText(o.approvalRate)} sub={`${o.declined} declined`} accent="#8b5cf6" hint="Approved requests ÷ (approved + declined)." />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
        <ChartCard title="Requests per month" hint="Last 6 months.">
          <LineChart data={data.monthly} color="#2563eb" />
        </ChartCard>
        <ChartCard title="Busiest days and hours" hint="Requests by weekday and hour, over your consultation hours.">
          <Heatmap data={data.heatmap} />
        </ChartCard>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
        <ChartCard title="What happened to requests">
          <StackedBar segments={[
            { label: 'Completed', value: o.completed, color: '#16a34a' },
            { label: 'Upcoming', value: o.upcoming, color: '#2563eb' },
            { label: 'Declined', value: o.declined, color: '#dc2626' },
            { label: 'No-show (student)', value: o.studentNoShows, color: '#f08a3c' },
            { label: 'Missed by me', value: o.missedByFaculty, color: '#e11d48' },
            { label: 'Cancelled by student', value: o.cancelledByStudent, color: '#94a3b8' },
            { label: 'Cancelled by me', value: o.cancelledByFaculty, color: '#64748b' },
          ]} />
        </ChartCard>
        <ChartCard title="Why students come" hint={`${s.purposes.total} requests, top reasons.`}>
          <HBarChart color="#0891b2" items={s.purposes.items.map(p => ({ label: p.label, value: p.count, note: `${p.percent}%` }))} emptyText="No requests yet." />
        </ChartCard>
      </SimpleGrid>

      <ChartCard title="Appeals from my students, by reason" hint="Appeals you have reviewed. Accepted appeals do not remove a no-show from your totals.">
        <AppealsByReason rows={appeals.rows} reasons={appeals.reasons} />
        <Text fontSize="xs" color={muted} mt={2}>
          Appeal rate {pctText(appeals.summary.appealRate)} · acceptance rate {pctText(appeals.summary.acceptanceRate)} · my own appeals to the Dean: {appeals.summary.faculty.made}
        </Text>
      </ChartCard>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <ChartCard title="Students by program">{s.byProgram.length ? <SimpleBarChart data={s.byProgram} color="#0891b2" height={140} /> : <Text fontSize="sm" color={muted}>No requests yet.</Text>}</ChartCard>
        <ChartCard title="Students by year level">{s.byYear.length ? <SimpleBarChart data={s.byYear} color="#059669" height={140} /> : <Text fontSize="sm" color={muted}>No requests yet.</Text>}</ChartCard>
      </SimpleGrid>
    </VStack>
  );
}
