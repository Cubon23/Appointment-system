import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Divider, Flex, Heading, HStack, Select, SimpleGrid, Spinner, Tab, TabList, TabPanel, TabPanels, Table,
  Tbody, Td, Text, Th, Thead, Tabs, Tr, VStack, useColorModeValue,
} from '@chakra-ui/react';
import { authFetch } from './authFetch';
import SimpleBarChart from './SimpleBarChart';
import IdleHoursPanel from './IdleHoursPanel';

// Shared by AdminDashboard and DeanDashboard. Everything shown here is calculated by the
// database (MongoDB aggregation pipelines in routes/analytics.js) and fetched in ONE request.
// Charts are plain SVG/divs — no charting library — matching SimpleBarChart.

interface LabelValue { label: string; value: number }
interface Overview {
  generatedAt: string;
  demographics: { totalStudents: number; totalFaculty: number; byProgram: LabelValue[]; byYear: LabelValue[]; byGender: LabelValue[]; byFacultyGender: LabelValue[] };
  statusSummary: { PENDING: number; APPROVED: number; REJECTED: number; COMPLETED: number; CANCELLED: number; MISSED: number; total: number };
  outcomes: {
    total: number; pending: number; approved: number; completed: number; rejected: number; other: number;
    cancelled: { total: number; byStudent: number; byFaculty: number; onLeave: number };
    missed: { total: number; student: number; faculty: number };
  };
  weeklyMissed: LabelValue[];
  facultyOutcomes: { facultyId: string; name: string; total: number; completed: number; rejected: number; cancelledByFaculty: number; studentNoShows: number; missedByFaculty: number }[];
  purposes: { total: number; items: { label: string; count: number; percent: number }[] };
  studentOutcomes: { studentKey: string; name: string; section: string; completed: number; rejected: number; cancelledByStudent: number; noShows: number }[];
  utilization: { facultyId: string; name: string; programPosition?: string; completed: number; total: number }[];
  weekly: LabelValue[];
}

const DONUT_COLORS = ['#2563eb', '#16a34a', '#f08a3c', '#8b5cf6', '#e11d48', '#0891b2', '#94a3b8'];

// ── Small building blocks ───────────────────────────────────────────────────

function StatCard({ label, value, accent, bg, border, text, muted }: {
  label: string; value: number | string; accent: string; bg: string; border: string; text: string; muted: string;
}) {
  return (
    <Box bg={bg} borderWidth="1px" borderColor={border} borderLeftWidth="4px" borderLeftColor={accent} borderRadius="lg" p={4}>
      <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.04em" color={muted}>{label}</Text>
      <Text fontSize="3xl" fontWeight="800" lineHeight="1.2" color={text}>{value}</Text>
    </Box>
  );
}

function DonutChart({ items, centerLabel, centerSub, textColor, mutedColor }: {
  items: { label: string; count: number }[]; centerLabel: string; centerSub: string; textColor: string; mutedColor: string;
}) {
  const r = 70;
  const stroke = 28;
  const circumference = 2 * Math.PI * r;
  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  let offset = 0;
  return (
    <svg viewBox="0 0 200 200" width="190" height="190" role="img" aria-label="Consultation purpose distribution">
      <g transform="rotate(-90 100 100)">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#94a3b8" strokeOpacity="0.25" strokeWidth={stroke} />
        {items.map((it, i) => {
          const len = (it.count / total) * circumference;
          const circle = (
            <circle
              key={it.label}
              cx="100" cy="100" r={r} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth={stroke}
              strokeDasharray={`${len} ${circumference - len}`} strokeDashoffset={-offset}
            />
          );
          offset += len;
          return circle;
        })}
      </g>
      <text x="100" y="100" textAnchor="middle" fontSize="28" fontWeight="800" fill={textColor}>{centerLabel}</text>
      <text x="100" y="120" textAnchor="middle" fontSize="11" fill={mutedColor}>{centerSub}</text>
    </svg>
  );
}

// ── The report ──────────────────────────────────────────────────────────────

export default function AnalyticsReport() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [outcomeView, setOutcomeView] = useState<'faculty' | 'student'>('faculty');
  const [loading, setLoading] = useState(true);

  // Same palette values the dashboards already use
  const surface = useColorModeValue('#ffffff', '#111d30');
  const tint = useColorModeValue('#f6f9fc', '#0c1421');
  const border = useColorModeValue('#dde3ec', '#1e3048');
  const text = useColorModeValue('#0f2240', '#e8f0fe');
  const muted = useColorModeValue('#6b7fa0', '#7a93b0');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/api/analytics/overview`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load analytics.');
      setData(body);
    } catch (e: any) {
      setError(e.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <Flex justify="center" py={12}><Spinner color="blue.400" /></Flex>;
  }
  if (error && !data) {
    return (
      <VStack py={8} spacing={3}>
        <Text color="red.400">{error}</Text>
        <Button size="sm" onClick={load}>Try again</Button>
      </VStack>
    );
  }
  if (!data) return null;

  const { demographics: demo, statusSummary: st, outcomes, weeklyMissed, facultyOutcomes, studentOutcomes, purposes, utilization, weekly } = data;
  const demoSeries = [
    { title: 'By Program', data: demo.byProgram, color: '#2563eb' },
    { title: 'By Year Level', data: demo.byYear, color: '#16a34a' },
    { title: 'Student Gender', data: demo.byGender, color: '#8b5cf6' },
    { title: 'Faculty Gender', data: demo.byFacultyGender, color: '#e11d48' },
  ];
  const maxCompleted = Math.max(1, ...utilization.map(u => u.completed));
  const sectionTitle = { size: 'sm', color: muted, textTransform: 'uppercase' as const, mb: 4 };

  // One merged table per role. "Completed" appears exactly once (it used to be shown both in the
  // utilization leaderboard and in the outcomes table), and there is no "Requests" column.
  const facultyRows = utilization.map(u => {
    const o = facultyOutcomes.find(f => f.facultyId === u.facultyId);
    return {
      ...u,
      rejected: o?.rejected ?? 0, cancelledByFaculty: o?.cancelledByFaculty ?? 0,
      missedByFaculty: o?.missedByFaculty ?? 0, studentNoShows: o?.studentNoShows ?? 0,
    };
  });
  const countCell = (n: number, color: string) => (
    <Td isNumeric color={n > 0 ? color : muted} fontWeight={n > 0 ? 700 : 400}>{n}</Td>
  );
  const tableBoxProps = {
    maxH: '320px', overflowY: 'auto' as const, borderWidth: '1px', borderColor: border, borderRadius: 'md',
    sx: { '@media print': { maxHeight: 'none', overflow: 'visible' } },
  };

  const facultyOutcomesTable = facultyRows.length > 0 ? (
    <Box {...tableBoxProps}>
      <Table size="sm">
        <Thead position="sticky" top={0} bg={surface} zIndex={1}>
          <Tr>
            <Th color={muted} w="48px">#</Th>
            <Th color={muted}>Faculty</Th>
            <Th color={muted} isNumeric>Completed</Th>
            <Th color={muted} isNumeric>Rejected</Th>
            <Th color={muted} isNumeric>Cancelled by faculty</Th>
            <Th color={muted} isNumeric>Missed by faculty</Th>
            <Th color={muted} isNumeric>Student no-shows</Th>
            <Th color={muted} minW="120px">Share of top</Th>
          </Tr>
        </Thead>
        <Tbody>
          {facultyRows.map((f, i) => (
            <Tr key={f.facultyId}>
              <Td color={muted}>{i + 1}</Td>
              <Td>
                <Text fontWeight="600" color={text}>{f.name}</Text>
                {f.programPosition && <Text fontSize="xs" color={muted}>{f.programPosition}</Text>}
              </Td>
              <Td isNumeric fontWeight="700" color={text}>{f.completed}</Td>
              <Td isNumeric color={text}>{f.rejected}</Td>
              {countCell(f.cancelledByFaculty, '#64748b')}
              {countCell(f.missedByFaculty, '#e11d48')}
              {countCell(f.studentNoShows, '#f08a3c')}
              <Td>
                <Box h="8px" borderRadius="4px" bg={tint}>
                  <Box h="100%" borderRadius="4px" bg="#f08a3c" w={`${(f.completed / maxCompleted) * 100}%`} />
                </Box>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  ) : <Text fontSize="sm" color={muted}>No faculty accounts yet.</Text>;

  const studentOutcomesTable = studentOutcomes.length > 0 ? (
    <Box {...tableBoxProps}>
      <Table size="sm">
        <Thead position="sticky" top={0} bg={surface} zIndex={1}>
          <Tr>
            <Th color={muted} w="48px">#</Th>
            <Th color={muted}>Student</Th>
            <Th color={muted} isNumeric>Completed</Th>
            <Th color={muted} isNumeric>Rejected</Th>
            <Th color={muted} isNumeric>Cancelled by student</Th>
            <Th color={muted} isNumeric>No-shows</Th>
          </Tr>
        </Thead>
        <Tbody>
          {studentOutcomes.map((s, i) => (
            <Tr key={s.studentKey}>
              <Td color={muted}>{i + 1}</Td>
              <Td>
                <Text fontWeight="600" color={text}>{s.name}</Text>
                {s.section && <Text fontSize="xs" color={muted}>{s.section}</Text>}
              </Td>
              <Td isNumeric fontWeight="700" color={text}>{s.completed}</Td>
              <Td isNumeric color={text}>{s.rejected}</Td>
              {countCell(s.cancelledByStudent, '#64748b')}
              {countCell(s.noShows, '#f08a3c')}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  ) : <Text fontSize="sm" color={muted}>No student outcomes yet.</Text>;

  return (
    <VStack align="stretch" spacing={8}>
      <HStack justify="space-between" className="no-print">
        <Text fontSize="xs" color={muted}>
          Calculated live by the database · updated {new Date(data.generatedAt).toLocaleTimeString()}
        </Text>
        <Button size="xs" variant="outline" onClick={load} isLoading={loading}>Refresh</Button>
      </HStack>

      {/* Metric 2 — status summary cards */}
      <Box>
        <Heading {...sectionTitle}>Appointment Status</Heading>
        <SimpleGrid columns={{ base: 2, md: 6 }} spacing={3}>
          <StatCard label="Pending" value={st.PENDING} accent="#eab308" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Approved" value={st.APPROVED} accent="#2563eb" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Rejected" value={st.REJECTED} accent="#dc2626" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Completed" value={st.COMPLETED} accent="#16a34a" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Cancelled" value={st.CANCELLED} accent="#94a3b8" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Missed" value={st.MISSED} accent="#f08a3c" bg={tint} border={border} text={text} muted={muted} />
        </SimpleGrid>
        <Text fontSize="xs" color={muted} mt={2}>{st.total} appointment requests in total.</Text>
      </Box>

      <Divider borderColor={border} />

      {/* Metric 1 — demographics */}
      <Box>
        <Heading {...sectionTitle}>User Demographics</Heading>
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mb={5}>
          <StatCard label="Total Students" value={demo.totalStudents} accent="#2563eb" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Total Faculty" value={demo.totalFaculty} accent="#f08a3c" bg={tint} border={border} text={text} muted={muted} />
        </SimpleGrid>

        <Box className="no-print">
          <Tabs variant="soft-rounded" size="sm" colorScheme="blue" isLazy>
            <TabList mb={3}>
              {demoSeries.map(s => <Tab key={s.title}>{s.title}</Tab>)}
            </TabList>
            <TabPanels>
              {demoSeries.map(s => (
                <TabPanel key={s.title} px={0}>
                  {s.data.length > 0
                    ? <SimpleBarChart data={s.data} color={s.color} />
                    : <Text fontSize="sm" color={muted}>No data yet.</Text>}
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        </Box>

        {/* When printing, show all three charts (tabs would only print the selected one) */}
        <Box display="none" sx={{ '@media print': { display: 'block' } }}>
          {demoSeries.map(s => (
            <Box key={s.title} mb={4}>
              <Text fontWeight="700" fontSize="sm" color={text} mb={1}>{s.title}</Text>
              {s.data.length > 0 ? <SimpleBarChart data={s.data} color={s.color} height={130} /> : <Text fontSize="sm">No data.</Text>}
            </Box>
          ))}
        </Box>

        {[...demo.byGender, ...demo.byFacultyGender].some(g => g.label === 'Not provided') && (
          <Text fontSize="xs" color={muted} mt={2}>
            Accounts showing Not provided were created before gender was collected at registration.
          </Text>
        )}
      </Box>

      <Divider borderColor={border} />

      {/* Metric 3 — purpose donut */}
      <Box>
        <Heading {...sectionTitle}>Why Students Request Consultations</Heading>
        {purposes.items.length > 0 ? (
          <Flex gap={8} align="center" wrap="wrap">
            <DonutChart
              items={purposes.items}
              centerLabel={String(purposes.total)}
              centerSub="requests"
              textColor={text}
              mutedColor={muted}
            />
            <VStack align="stretch" spacing={2} flex="1" minW="220px">
              {purposes.items.map((it, i) => (
                <HStack key={it.label} justify="space-between">
                  <HStack spacing={2}>
                    <Box w="12px" h="12px" borderRadius="3px" bg={DONUT_COLORS[i % DONUT_COLORS.length]} flexShrink={0} />
                    <Text fontSize="sm" color={text}>{it.label}</Text>
                  </HStack>
                  <Text fontSize="sm" color={muted}><b style={{ color: text }}>{it.percent}%</b> · {it.count}</Text>
                </HStack>
              ))}
            </VStack>
          </Flex>
        ) : <Text fontSize="sm" color={muted}>No appointment requests yet.</Text>}
      </Box>

      <Divider borderColor={border} />

      {/* Appointments per week (carried over from the previous report) */}
      <Box>
        <Heading {...sectionTitle}>Appointments per Week (last 8 weeks)</Heading>
        <SimpleBarChart data={weekly} color="#16a34a" />
      </Box>

      <Divider borderColor={border} />

      {/* Metric 4 — outcomes per faculty / per student (dropdown) */}
      <Box>
        <HStack justify="space-between" align="center" mb={4} wrap="wrap" spacing={3}>
          <Heading size="sm" color={muted} textTransform="uppercase">
            {outcomeView === 'faculty' ? 'Faculty Outcomes' : 'Student Outcomes'}
          </Heading>
          <Select
            size="sm" w="160px" className="no-print" value={outcomeView}
            onChange={(e) => setOutcomeView(e.target.value as 'faculty' | 'student')}
            color={text} borderColor={border}
          >
            <option value="faculty">Faculty</option>
            <option value="student">Student</option>
          </Select>
        </HStack>
        <Box className="no-print">
          {outcomeView === 'faculty' ? facultyOutcomesTable : studentOutcomesTable}
        </Box>
        {/* When printing, include both tables (the dropdown only shows one) */}
        <Box display="none" sx={{ '@media print': { display: 'block' } }}>
          <Text fontWeight="700" fontSize="sm" color={text} mb={1}>Faculty Outcomes</Text>
          {facultyOutcomesTable}
          <Text fontWeight="700" fontSize="sm" color={text} mt={4} mb={1}>Student Outcomes</Text>
          {studentOutcomesTable}
        </Box>
      </Box>

      <Divider borderColor={border} />

      {/* Rejected / cancelled / missed — who was behind each one */}
      <Box>
        <Heading {...sectionTitle}>Rejected, Cancelled &amp; Missed Consultations</Heading>
        <SimpleGrid columns={{ base: 2, md: 3, lg: 6 }} spacing={3}>
          <StatCard label="Rejected" value={outcomes.rejected} accent="#dc2626" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Cancelled by student" value={outcomes.cancelled.byStudent} accent="#94a3b8" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Cancelled by faculty" value={outcomes.cancelled.byFaculty} accent="#64748b" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Cancelled (on leave)" value={outcomes.cancelled.onLeave} accent="#8b5cf6" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Missed by student" value={outcomes.missed.student} accent="#f08a3c" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Missed by faculty" value={outcomes.missed.faculty} accent="#e11d48" bg={tint} border={border} text={text} muted={muted} />
        </SimpleGrid>
        <Text fontSize="xs" color={muted} mt={2}>
          “Missed by student” = the faculty marked a no-show. “Missed by faculty” = an approved consultation that was never completed or marked by the end of its day.
        </Text>

        <Heading size="xs" color={muted} textTransform="uppercase" mt={6} mb={2}>Missed consultations per week (last 8 weeks)</Heading>
        <SimpleBarChart data={weeklyMissed} color="#f08a3c" height={130} />
      </Box>

      <Divider borderColor={border} />

      {/* Consultation hours that nobody requested, week by week */}
      <IdleHoursPanel />
    </VStack>
  );
}
