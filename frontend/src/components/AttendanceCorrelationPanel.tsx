import { useEffect, useMemo, useState } from 'react';
import {
  Box, Heading, Text, Select, Button, HStack, VStack, SimpleGrid, Badge,
  Table, Thead, Tbody, Tr, Th, Td, TableContainer,
} from '@chakra-ui/react';
import { authFetch } from './authFetch';
import SimpleBarChart from './SimpleBarChart';

interface Palette { surface: string; border: string; text: string; textMid: string }

interface Row {
  facultyId: string;
  name: string;
  consultations: number;
  scheduledDays: number;
  onTime: number;
  late: number;
  missed: number;
  excused: number;
  checkedInPct: number | null;
  onTimePct: number | null;
}
interface Result {
  month: string;
  period: { start: string; end: string };
  trackingSince: string | null;
  rows: Row[];
  summary: { facultyWithData: number; totalConsultations: number; overallOnTimePct: number | null; correlation: number | null };
}

const monthOptions = () => {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i < 6; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({
      value: `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`,
      label: x.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }
  return out;
};

const describeCorrelation = (r: number | null) => {
  if (r === null) return 'Not enough data yet (needs at least 5 faculty with logged attendance).';
  const a = Math.abs(r);
  const strength = a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'little to no';
  const dir = a < 0.2 ? '' : r > 0 ? ' positive' : ' negative';
  return `${strength}${dir} relationship between on-time attendance and consultations completed.`;
};

export default function AttendanceCorrelationPanel({ C }: { C: Palette }) {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0].value);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/analytics/attendance-consultation?month=${month}`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed to load.');
        return j as Result;
      })
      .then(j => { if (alive) setData(j); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [month]);

  const withData = (data?.rows ?? []).filter(r => r.scheduledDays > 0);
  const sorted = [...(data?.rows ?? [])].sort((a, b) => b.consultations - a.consultations);
  const monthLabel = months.find(m => m.value === month)?.label ?? month;
  const card = { bg: C.surface, p: 6, borderRadius: 'lg', borderWidth: '1px', borderColor: C.border, shadow: 'sm' } as const;
  const tile = (label: string, value: string) => (
    <Box borderWidth="1px" borderColor={C.border} borderRadius="md" p={4}>
      <Text fontSize="xs" color={C.textMid}>{label}</Text>
      <Text fontSize="2xl" fontWeight="800" color={C.text}>{value}</Text>
    </Box>
  );

  return (
    <VStack align="stretch" spacing={6} id="print-area">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      <Box {...card}>
        <HStack justify="space-between" flexWrap="wrap" mb={2}>
          <Box>
            <Heading size="md" color={C.text}>Attendance vs. Consultations</Heading>
            <Text fontSize="sm" color={C.textMid}>{monthLabel} · per faculty member</Text>
          </Box>
          <HStack className="no-print">
            <Select size="sm" w="190px" value={month} onChange={e => setMonth(e.target.value)} color={C.text}>
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
            <Button size="sm" colorScheme="blue" onClick={() => window.print()}>Print Report</Button>
          </HStack>
        </HStack>
        {loading && <Text color={C.textMid}>Loading…</Text>}
        {error && <Text color="red.500">{error}</Text>}
        {data && !loading && (
          <>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mt={3}>
              {tile('Consultations completed', String(data.summary.totalConsultations))}
              {tile('Overall on-time check-in', data.summary.overallOnTimePct === null ? '—' : `${data.summary.overallOnTimePct}%`)}
              {tile('Correlation (r)', data.summary.correlation === null ? '—' : String(data.summary.correlation))}
            </SimpleGrid>
            <Text fontSize="sm" color={C.textMid} mt={3}>{describeCorrelation(data.summary.correlation)}</Text>
          </>
        )}
      </Box>

      {data && !loading && (
        <>
          <Box {...card}>
            <TableContainer>
              <Table size="sm">
                <Thead>
                  <Tr><Th>Faculty</Th><Th isNumeric>Consultations</Th><Th isNumeric>Duty days</Th><Th isNumeric>On time</Th><Th isNumeric>Late</Th><Th isNumeric>Missed</Th><Th isNumeric>Leave</Th><Th isNumeric>On-time %</Th></Tr>
                </Thead>
                <Tbody>
                  {sorted.map(r => (
                    <Tr key={r.facultyId}>
                      <Td color={C.text} fontWeight="600">{r.name}</Td>
                      <Td isNumeric color={C.text}>{r.consultations}</Td>
                      <Td isNumeric color={C.text}>{r.scheduledDays}</Td>
                      <Td isNumeric color={C.text}>{r.onTime}</Td>
                      <Td isNumeric color={C.text}>{r.late}</Td>
                      <Td isNumeric color={C.text}>{r.missed}</Td>
                      <Td isNumeric color={C.text}>{r.excused}</Td>
                      <Td isNumeric>
                        {r.onTimePct === null
                          ? <Badge>No data</Badge>
                          : <Badge colorScheme={r.onTimePct >= 90 ? 'green' : r.onTimePct >= 70 ? 'yellow' : 'red'}>{r.onTimePct}%</Badge>}
                      </Td>
                    </Tr>
                  ))}
                  {sorted.length === 0 && <Tr><Td colSpan={8} color={C.textMid}>No faculty found.</Td></Tr>}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>

          {withData.length > 0 && (
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
              <Box {...card}>
                <Heading size="sm" color={C.text} mb={3}>Consultations completed</Heading>
                <SimpleBarChart data={sorted.slice(0, 8).map(r => ({ label: r.name, value: r.consultations }))} />
              </Box>
              <Box {...card}>
                <Heading size="sm" color={C.text} mb={3}>On-time check-in (%)</Heading>
                <SimpleBarChart color="#16a34a" data={withData.slice(0, 8).map(r => ({ label: r.name, value: r.onTimePct ?? 0 }))} />
              </Box>
            </SimpleGrid>
          )}

          <Box {...card}>
            <Heading size="xs" color={C.text} mb={2}>How this is measured</Heading>
            <Text fontSize="xs" color={C.textMid}>
              A <b>duty day</b> is a weekday on which the faculty has a class or consultation block. The faculty's first live-status update that day is the
              check-in; it is <b>on time</b> if made before their first block starts. A duty day with no check-in is <b>missed</b>; a day marked On Leave is excused and not counted.
              Consultations are those marked Completed in the month. Correlation (Pearson r) is shown once at least 5 faculty have data.
              {data.trackingSince
                ? ` Check-ins have been recorded since ${new Date(data.trackingSince + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}; earlier days are not judged.`
                : ' No check-ins have been recorded yet.'}
            </Text>
          </Box>
        </>
      )}
    </VStack>
  );
}
