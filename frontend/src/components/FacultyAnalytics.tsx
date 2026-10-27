import { useEffect, useState } from 'react';
import { Box, Heading, SimpleGrid, Spinner, Text, VStack, HStack, Progress, useColorModeValue } from '@chakra-ui/react';
import { authFetch } from './authFetch';
import SimpleBarChart from './SimpleBarChart';

interface LV { label: string; value: number }
interface Data {
  outcomes: {
    total: number; pending: number; approved: number; completed: number; rejected: number;
    cancelledByStudent: number; cancelledByFaculty: number; studentNoShows: number; missedByFaculty: number;
    completionRate: number | null; appeals: { received: number; accepted: number; made: number };
  };
  hours: {
    weeklyAvailableMinutes: number; officialMinutes: number; addedMinutes: number; bookedMinutesLast4Weeks: number;
    utilizationPercent: number | null; byDay: LV[]; byHour: LV[];
  };
  students: { uniqueStudents: number; byProgram: LV[]; byYear: LV[]; purposes: { total: number; items: { label: string; count: number; percent: number }[] } };
}

const hrs = (min: number) => `${Math.round((min / 60) * 10) / 10} h`;

// A faculty member's own analytics. The server only ever returns the logged-in faculty's data.
export default function FacultyAnalytics() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const cardBg = useColorModeValue('#ffffff', '#111d30');
  const border = useColorModeValue('#dde3ec', '#1e3048');
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
  const { outcomes: o, hours: h, students: s } = data;

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Box bg={cardBg} p={5} borderRadius="lg" borderWidth="1px" borderColor={border} shadow="sm">
      <Heading size="sm" color={text} mb={3}>{title}</Heading>
      {children}
    </Box>
  );
  const Stat = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
    <Box>
      <Text fontSize="2xl" fontWeight="800" color={text} lineHeight="1.1">{value}</Text>
      <Text fontSize="xs" color={muted}>{label}</Text>
      {hint && <Text fontSize="10px" color={muted}>{hint}</Text>}
    </Box>
  );

  return (
    <VStack align="stretch" spacing={6}>
      <Heading size="md" color={text}>My Analytics</Heading>

      <Card title="Request outcomes">
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={4}>
          <Stat label="Total requests" value={o.total} />
          <Stat label="Completed" value={o.completed} />
          <Stat label="Completion rate" value={o.completionRate === null ? '—' : `${o.completionRate}%`} hint="completed of those that should have happened" />
          <Stat label="Pending now" value={o.pending} />
        </SimpleGrid>
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
          <Stat label="Approved (upcoming)" value={o.approved} />
          <Stat label="Declined" value={o.rejected} />
          <Stat label="Student no-shows" value={o.studentNoShows} />
          <Stat label="Cancelled by students" value={o.cancelledByStudent} />
          <Stat label="Cancelled by me" value={o.cancelledByFaculty} />
          <Stat label="Missed by me" value={o.missedByFaculty} />
          <Stat label="Student appeals received" value={o.appeals.received} hint={`${o.appeals.accepted} accepted`} />
          <Stat label="My appeals" value={o.appeals.made} />
        </SimpleGrid>
      </Card>

      <Card title="Consultation hours use">
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={4}>
          <Stat label="Hours available per week" value={hrs(h.weeklyAvailableMinutes)} hint={`${hrs(h.officialMinutes)} fixed + ${hrs(h.addedMinutes)} added`} />
          <Stat label="Booked, last 4 weeks" value={hrs(h.bookedMinutesLast4Weeks)} />
          <Stat label="Utilization" value={h.utilizationPercent === null ? '—' : `${h.utilizationPercent}%`} hint="booked ÷ available over 4 weeks" />
        </SimpleGrid>
        {h.utilizationPercent !== null && <Progress value={h.utilizationPercent} size="sm" borderRadius="full" colorScheme="blue" mb={5} />}
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          <Box><Text fontSize="xs" fontWeight="700" color={muted} mb={2}>Consultations by day</Text><SimpleBarChart data={h.byDay} height={150} /></Box>
          <Box>
            <Text fontSize="xs" fontWeight="700" color={muted} mb={2}>Consultations by start time</Text>
            {h.byHour.length ? <SimpleBarChart data={h.byHour} color="#7c3aed" height={150} /> : <Text fontSize="sm" color={muted}>No consultations yet.</Text>}
          </Box>
        </SimpleGrid>
      </Card>

      <Card title="Students and purposes">
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
          <Box>
            <Stat label="Different students" value={s.uniqueStudents} />
          </Box>
          <Box><Text fontSize="xs" fontWeight="700" color={muted} mb={2}>By program</Text>{s.byProgram.length ? <SimpleBarChart data={s.byProgram} color="#0891b2" height={140} /> : <Text fontSize="sm" color={muted}>No requests yet.</Text>}</Box>
          <Box><Text fontSize="xs" fontWeight="700" color={muted} mb={2}>By year level</Text>{s.byYear.length ? <SimpleBarChart data={s.byYear} color="#059669" height={140} /> : <Text fontSize="sm" color={muted}>No requests yet.</Text>}</Box>
        </SimpleGrid>
        <Text fontSize="xs" fontWeight="700" color={muted} mt={5} mb={2}>Purpose of meeting</Text>
        {s.purposes.items.length === 0 ? <Text fontSize="sm" color={muted}>No requests yet.</Text> : (
          <VStack align="stretch" spacing={2}>
            {s.purposes.items.map(p => (
              <Box key={p.label}>
                <HStack justify="space-between" fontSize="sm" color={text}><Text noOfLines={1}>{p.label}</Text><Text color={muted} whiteSpace="nowrap">{p.count} · {p.percent}%</Text></HStack>
                <Progress value={p.percent} size="xs" borderRadius="full" colorScheme="blue" />
              </Box>
            ))}
          </VStack>
        )}
      </Card>
    </VStack>
  );
}
