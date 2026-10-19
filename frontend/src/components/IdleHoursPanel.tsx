import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Box, Button, Flex, HStack, Heading, SimpleGrid, Spinner, Table, Tbody, Td, Text, Th, Thead, Tr, VStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { authFetch } from './authFetch';

// "Idle consultation hours": for one Monday–Sunday week, every consultation-hour block of every
// faculty member and whether anyone requested an appointment inside it (any status counts).
// Shown inside Reports & Analytics for both Admin and Dean.

interface Slot { date: string; dayOfWeek: number; start: string; end: string; requests: number; state: 'REQUESTED' | 'IDLE' | 'UPCOMING' }
interface FacultyLine { facultyId: string; name: string; blocks: number; withRequests: number; idle: number; upcoming: number; slots: Slot[] }
interface IdleData {
  weekStart: string; weekEnd: string; today: string;
  summary: { blocks: number; withRequests: number; idle: number; upcoming: number };
  faculty: FacultyLine[];
  facultyWithoutHours: string[];
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const t12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const shiftWeek = (iso: string, weeks: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};

export default function IdleHoursPanel() {
  const [week, setWeek] = useState(''); // '' = this week (the server decides)
  const [data, setData] = useState<IdleData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const tint = useColorModeValue('#f6f9fc', '#0c1421');
  const border = useColorModeValue('#dde3ec', '#1e3048');
  const text = useColorModeValue('#0f2240', '#e8f0fe');
  const muted = useColorModeValue('#6b7fa0', '#7a93b0');

  const load = useCallback(async (w: string) => {
    setLoading(true); setError('');
    try {
      const res = await authFetch(`${import.meta.env.VITE_API_URL}/api/analytics/idle-hours${w ? `?week=${w}` : ''}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load consultation hours.');
      setData(body);
    } catch (e: any) {
      setError(e.message || 'Could not load consultation hours.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(week); }, [week, load]);

  const card = (label: string, value: number, accent: string) => (
    <Box bg={tint} borderWidth="1px" borderColor={border} borderLeftWidth="4px" borderLeftColor={accent} borderRadius="lg" p={4}>
      <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.04em" color={muted}>{label}</Text>
      <Text fontSize="3xl" fontWeight="800" lineHeight="1.2" color={text}>{value}</Text>
    </Box>
  );

  const thisWeek = data ? data.today >= data.weekStart && data.today <= data.weekEnd : true;

  return (
    <VStack align="stretch" spacing={4}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
        <Heading size="sm" color={muted} textTransform="uppercase">Consultation Hours With No Requests</Heading>
        <HStack className="no-print" spacing={2}>
          <Button size="xs" variant="outline" onClick={() => data && setWeek(shiftWeek(data.weekStart, -1))} isDisabled={!data || loading}>← Previous week</Button>
          <Button size="xs" variant="outline" onClick={() => setWeek('')} isDisabled={loading || (thisWeek && week === '')}>This week</Button>
          <Button size="xs" variant="outline" onClick={() => data && setWeek(shiftWeek(data.weekStart, 1))} isDisabled={!data || loading}>Next week →</Button>
        </HStack>
      </Flex>

      {loading && !data && <Flex justify="center" py={6}><Spinner color="blue.400" /></Flex>}
      {error && <Text color="red.400" fontSize="sm">{error}</Text>}

      {data && (
        <>
          <Text fontSize="sm" color={text}>
            Week of <b>{shortDate(data.weekStart)}</b> – <b>{shortDate(data.weekEnd)}</b>
            {thisWeek && <Badge ml={2} colorScheme="blue">This week</Badge>}
          </Text>

          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
            {card('Consultation blocks', data.summary.blocks, '#2563eb')}
            {card('Got requests', data.summary.withRequests, '#16a34a')}
            {card('No requests (ended)', data.summary.idle, '#dc2626')}
            {card('Still upcoming', data.summary.upcoming, '#94a3b8')}
          </SimpleGrid>
          <Text fontSize="xs" color={muted}>
            A block counts as “no requests” only after it has ended and nobody asked for an appointment inside it.
            Any request counts, including ones that were later rejected or cancelled.
          </Text>

          <Box borderWidth="1px" borderColor={border} borderRadius="md" overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th color={muted}>Faculty</Th>
                  <Th color={muted} isNumeric>Blocks</Th>
                  <Th color={muted} isNumeric>Got requests</Th>
                  <Th color={muted} isNumeric>No requests</Th>
                  <Th color={muted}>Blocks with no requests</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.faculty.filter(f => f.blocks > 0).map(f => (
                  <Tr key={f.facultyId}>
                    <Td fontWeight="600" color={text}>{f.name}</Td>
                    <Td isNumeric color={text}>{f.blocks}</Td>
                    <Td isNumeric color={text}>{f.withRequests}</Td>
                    <Td isNumeric fontWeight="700" color={f.idle > 0 ? '#dc2626' : text}>{f.idle}</Td>
                    <Td>
                      <Flex gap={1} wrap="wrap">
                        {f.slots.filter(s => s.state === 'IDLE').map(s => (
                          <Badge key={`${s.date}${s.start}`} colorScheme="red" variant="subtle" fontWeight="500">
                            {DAY[s.dayOfWeek]} {shortDate(s.date)} · {t12(s.start)}–{t12(s.end)}
                          </Badge>
                        ))}
                        {f.idle === 0 && <Text fontSize="xs" color={muted}>—</Text>}
                      </Flex>
                    </Td>
                  </Tr>
                ))}
                {data.faculty.every(f => f.blocks === 0) && (
                  <Tr><Td colSpan={5} color={muted}>No consultation hours have been set by any faculty yet.</Td></Tr>
                )}
              </Tbody>
            </Table>
          </Box>

          {data.facultyWithoutHours.length > 0 && (
            <Text fontSize="xs" color={muted}>
              No consultation hours set: {data.facultyWithoutHours.join(', ')}.
            </Text>
          )}
        </>
      )}
    </VStack>
  );
}
