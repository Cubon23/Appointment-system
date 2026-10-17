import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Divider, Flex, Heading, HStack, SimpleGrid, Spinner, Tab, TabList, TabPanel, TabPanels, Table,
  Tbody, Td, Text, Th, Thead, Tabs, Tr, VStack, useColorModeValue,
} from '@chakra-ui/react';
import { authFetch } from './authFetch';
import SimpleBarChart from './SimpleBarChart';

// Shared by AdminDashboard and DeanDashboard. Everything shown here is calculated by the
// database (MongoDB aggregation pipelines in routes/analytics.js) and fetched in ONE request.
// Charts are plain SVG/divs — no charting library — matching SimpleBarChart.

interface LabelValue { label: string; value: number }
interface Overview {
  generatedAt: string;
  demographics: { totalStudents: number; totalFaculty: number; byProgram: LabelValue[]; byYear: LabelValue[]; byGender: LabelValue[] };
  statusSummary: { PENDING: number; APPROVED: number; REJECTED: number; COMPLETED: number; CANCELLED: number; total: number };
  purposes: { total: number; items: { label: string; count: number; percent: number }[] };
  utilization: { facultyId: string; name: string; programPosition?: string; completed: number; total: number }[];
  weekly: LabelValue[];
  statusCompliance: { percent: number; compliantDays: number; expectedDays: number; workdays: number; facultyCount: number };
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

function GaugeChart({ percent, textColor, mutedColor }: { percent: number; textColor: string; mutedColor: string }) {
  const arcLength = Math.PI * 80; // length of a semicircle with radius 80
  const pct = Math.max(0, Math.min(100, percent));
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#f08a3c' : '#dc2626';
  const arc = 'M 20 100 A 80 80 0 0 1 180 100';
  return (
    <svg viewBox="0 0 200 125" width="100%" style={{ maxWidth: 280 }} role="img" aria-label={`Compliance ${pct}%`}>
      <path d={arc} fill="none" stroke="#94a3b8" strokeOpacity="0.25" strokeWidth="18" strokeLinecap="round" />
      {pct > 0 && (
        <path d={arc} fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" strokeDasharray={`${(pct / 100) * arcLength} ${arcLength}`} />
      )}
      <text x="100" y="92" textAnchor="middle" fontSize="30" fontWeight="800" fill={textColor}>{pct}%</text>
      <text x="20" y="120" textAnchor="middle" fontSize="10" fill={mutedColor}>0%</text>
      <text x="180" y="120" textAnchor="middle" fontSize="10" fill={mutedColor}>100%</text>
    </svg>
  );
}

// ── The report ──────────────────────────────────────────────────────────────

export default function AnalyticsReport() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
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

  const { demographics: demo, statusSummary: st, purposes, utilization, weekly, statusCompliance: comp } = data;
  const demoSeries = [
    { title: 'By Program', data: demo.byProgram, color: '#2563eb' },
    { title: 'By Year Level', data: demo.byYear, color: '#16a34a' },
    { title: 'By Gender', data: demo.byGender, color: '#8b5cf6' },
  ];
  const maxCompleted = Math.max(1, ...utilization.map(u => u.completed));
  const sectionTitle = { size: 'sm', color: muted, textTransform: 'uppercase' as const, mb: 4 };

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
        <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3}>
          <StatCard label="Pending" value={st.PENDING} accent="#eab308" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Approved" value={st.APPROVED} accent="#2563eb" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Rejected" value={st.REJECTED} accent="#dc2626" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Completed" value={st.COMPLETED} accent="#16a34a" bg={tint} border={border} text={text} muted={muted} />
          <StatCard label="Cancelled" value={st.CANCELLED} accent="#94a3b8" bg={tint} border={border} text={text} muted={muted} />
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

        {demo.byGender.length > 0 && (
          <Text fontSize="xs" color={muted} mt={2}>
            Gender is only known for students who shared it when booking a consultation.
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

      {/* Metric 4 — faculty utilization leaderboard */}
      <Box>
        <Heading {...sectionTitle}>Faculty Utilization (completed consultations)</Heading>
        {utilization.length > 0 ? (
          <Box maxH="320px" overflowY="auto" borderWidth="1px" borderColor={border} borderRadius="md" sx={{ '@media print': { maxHeight: 'none', overflow: 'visible' } }}>
            <Table size="sm">
              <Thead position="sticky" top={0} bg={surface} zIndex={1}>
                <Tr>
                  <Th color={muted} w="48px">#</Th>
                  <Th color={muted}>Faculty</Th>
                  <Th color={muted} isNumeric>Completed</Th>
                  <Th color={muted} isNumeric>Requests</Th>
                  <Th color={muted} minW="120px">Share of top</Th>
                </Tr>
              </Thead>
              <Tbody>
                {utilization.map((u, i) => (
                  <Tr key={u.facultyId}>
                    <Td color={muted}>{i + 1}</Td>
                    <Td>
                      <Text fontWeight="600" color={text}>{u.name}</Text>
                      {u.programPosition && <Text fontSize="xs" color={muted}>{u.programPosition}</Text>}
                    </Td>
                    <Td isNumeric fontWeight="700" color={text}>{u.completed}</Td>
                    <Td isNumeric color={muted}>{u.total}</Td>
                    <Td>
                      <Box h="8px" borderRadius="4px" bg={tint}>
                        <Box h="100%" borderRadius="4px" bg="#f08a3c" w={`${(u.completed / maxCompleted) * 100}%`} />
                      </Box>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        ) : <Text fontSize="sm" color={muted}>No faculty accounts yet.</Text>}
      </Box>

      <Divider borderColor={border} />

      {/* Metric 5 (replacement) — status-update compliance gauge */}
      <Box>
        <Heading {...sectionTitle}>Faculty Status-Update Compliance (last 7 days)</Heading>
        <Flex gap={8} align="center" wrap="wrap">
          <Box flex="0 0 auto" w="100%" maxW="280px"><GaugeChart percent={comp.percent} textColor={text} mutedColor={muted} /></Box>
          <VStack align="start" spacing={1} flex="1" minW="220px">
            <Text fontSize="sm" color={text}>
              Faculty posted a status on <b>{comp.compliantDays}</b> of <b>{comp.expectedDays}</b> expected weekdays
              ({comp.facultyCount} faculty × {comp.workdays} weekdays).
            </Text>
            <Text fontSize="xs" color={muted}>
              Counts a faculty member as compliant for a day if they posted at least one live status that day.
            </Text>
          </VStack>
        </Flex>
      </Box>
    </VStack>
  );
}
