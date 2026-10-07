import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Heading, Table, Thead, Tbody, Tr, Th, Td, TableContainer,
  Badge, Text, Button as ChakraButton, HStack, Flex, VStack,
  useColorMode, SimpleGrid, CircularProgress, CircularProgressLabel
} from '@chakra-ui/react';
import { authFetch } from './authFetch';
import NotificationBell from './NotificationBell';
import SimpleBarChart from './SimpleBarChart';

// === Helper function for time formatting ===
export const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const [hour, minute] = timeStr.split(':');
  const h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const standardHour = h % 12 || 12;
  return `${standardHour}:${minute} ${ampm}`;
};

export default function DeanDashboard() {
  const navigate = useNavigate();
  const { colorMode, toggleColorMode } = useColorMode();

  const userName = localStorage.getItem('userName');

  // Unified Page State
  const [activePage, setActivePage] = useState<'analytics' | 'roster' | 'reports' | 'records'>('analytics');
  
  // Custom Navy Sidebar Color palette
  const dk = colorMode === 'dark';
  const C = {
    pageBg:    dk ? "#0c1421" : "#eef2f7",
    sidebar:   dk ? "#070e1b" : "#0f2240",
    surface:   dk ? "#111d30" : "#ffffff",
    border:    dk ? "#1e3048" : "#dde3ec",
    text:      dk ? "#e8f0fe" : "#0f2240",
    textMid:   dk ? "#7a93b0" : "#6b7fa0",
    navText:   dk ? "#7a93b0" : "#8eaecb",
    navActive: dk ? "#ffffff" : "#ffffff",
    navBg:     dk ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.10)",
  };

  const [facultyRoster, setFacultyRoster] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [recordsSearch, setRecordsSearch] = useState('');

  const fetchData = () => {
    // Phase 1 Analytics: Pull live board data
    authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/status`)
      .then((res) => res.json())
      .then((data) => setFacultyRoster(data));
    // Reports & Analytics / Consultation Records: dean is allowed on this
    // route (STAFF = FACULTY/ADMIN/DEAN on the backend), same data Admin uses.
    authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointments/all`)
      .then((res) => res.json())
      .then((data) => setAppointments(Array.isArray(data) ? data : []));
  };

  useEffect(() => {
    fetchData();
    // Poll for changes every 30 seconds
    const intervalId = setInterval(fetchData, 30000);
    return () => clearInterval(intervalId);
  }, []);

  const handleExportCSV = () => {
    // Generate simple CSV payload
    let csvContent = "data:text/csv;charset=utf-8,Name,Program/Position,Live Status,Location\n";
    facultyRoster.forEach(f => {
      const location = f.currentLocation || f.room || 'N/A';
      csvContent += `${f.name},${f.programPosition},${f.currentStatus},${location}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ccis_faculty_status_report.csv");
    document.body.appendChild(link);
    link.click();
  };

  // --- UI COMPONENTS ---

  const renderSidebar = () => (
    <Box w="196px" bg={C.sidebar} p={6} h="100vh" position="sticky" top="0" display="flex" flexDir="column">
      <Heading size="sm" mb={6} color="#fff" letterSpacing="tight">Dean's Office</Heading>
      <NotificationBell navText={C.navText} navBg={C.navBg} />
      <VStack align="stretch" spacing={1} flex="1">
        <button 
          onClick={() => setActivePage('analytics')}
          style={{
            background: activePage === 'analytics' ? C.navBg : 'transparent',
            color: activePage === 'analytics' ? C.navActive : C.navText,
            border: 'none', textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
            fontWeight: activePage === 'analytics' ? 600 : 400
          }}
        >
          Department Health
        </button>
        <button 
          onClick={() => setActivePage('roster')}
          style={{
            background: activePage === 'roster' ? C.navBg : 'transparent',
            color: activePage === 'roster' ? C.navActive : C.navText,
            border: 'none', textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
            fontWeight: activePage === 'roster' ? 600 : 400
          }}
        >
          Faculty Roster
        </button>
        <button
          onClick={() => setActivePage('reports')}
          style={{
            background: activePage === 'reports' ? C.navBg : 'transparent',
            color: activePage === 'reports' ? C.navActive : C.navText,
            border: 'none', textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
            fontWeight: activePage === 'reports' ? 600 : 400
          }}
        >
          Reports & Analytics
        </button>
        <button
          onClick={() => setActivePage('records')}
          style={{
            background: activePage === 'records' ? C.navBg : 'transparent',
            color: activePage === 'records' ? C.navActive : C.navText,
            border: 'none', textAlign: 'left', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
            fontWeight: activePage === 'records' ? 600 : 400
          }}
        >
          Consultation Records
        </button>
      </VStack>
      <VStack spacing={4} mt="auto">
        <ChakraButton size="sm" variant="outline" color={C.navText} borderColor="gray.600" w="100%" onClick={toggleColorMode}>{colorMode === 'light' ? 'Dark Mode' : 'Light Mode'}</ChakraButton>
        <ChakraButton size="sm" colorScheme="red" w="100%" onClick={() => { localStorage.clear(); navigate('/'); }}>Logout</ChakraButton>
      </VStack>
    </Box>
  );

  const compliancePercentage = useMemo(() => {
    const total = facultyRoster.length;
    if (total === 0) return 0;
    const missing = facultyRoster.filter(f => f.currentStatus === 'NOT_UPDATED').length;
    return Math.round(((total - missing) / total) * 100);
  }, [facultyRoster]);

  // === Reports & Analytics / Consultation Records ===
  // Same computation as AdminDashboard.tsx, kept in sync by hand since the
  // two dashboards have very different layouts and don't share a page
  // component. If this logic changes, update both files.
  const statusCounts = useMemo(() => {
    const order = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'];
    return order.map(status => ({
      label: status.charAt(0) + status.slice(1).toLowerCase(),
      value: appointments.filter(a => a.status === status).length,
    }));
  }, [appointments]);

  const weeklyTrend = useMemo(() => {
    const weeks: { label: string; start: Date; value: number }[] = [];
    const now = new Date();
    const startOfWeek = (d: Date) => {
      const copy = new Date(d);
      const day = copy.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      copy.setDate(copy.getDate() + diff);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };
    const thisWeekStart = startOfWeek(now);
    for (let i = 7; i >= 0; i--) {
      const start = new Date(thisWeekStart);
      start.setDate(start.getDate() - i * 7);
      weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start, value: 0 });
    }
    appointments.forEach(a => {
      if (!a.date) return;
      const d = new Date(a.date);
      if (isNaN(d.getTime())) return;
      const ws = startOfWeek(d).getTime();
      const match = weeks.find(w => w.start.getTime() === ws);
      if (match) match.value += 1;
    });
    return weeks.map(({ label, value }) => ({ label, value }));
  }, [appointments]);

  const facultyUtilization = useMemo(() => {
    const counts = new Map<string, number>();
    appointments.forEach(a => {
      if (a.status !== 'COMPLETED') return;
      const name = a.facultyId?.name || 'Unknown';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
  }, [appointments]);

  const consultationRecords = useMemo(() => {
    return appointments
      .filter(a => a.status === 'COMPLETED')
      .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  }, [appointments]);

  const filteredRecords = useMemo(() => {
    const q = recordsSearch.trim().toLowerCase();
    if (!q) return consultationRecords;
    return consultationRecords.filter((r: any) =>
      r.studentName?.toLowerCase().includes(q) ||
      r.facultyId?.name?.toLowerCase().includes(q) ||
      r.reason?.toLowerCase().includes(q)
    );
  }, [consultationRecords, recordsSearch]);

  return (
    <Flex minH="100vh" bg={C.pageBg}>
      {renderSidebar()}
      <Box flex="1" p={10} overflowY="auto">
        <Box mb={8}>
          <Heading size="lg" color={C.text} letterSpacing="tight">Dean Dashboard</Heading>
          <Text color={C.textMid}>Welcome, {userName}</Text>
        </Box>

        {activePage === 'analytics' && (
          <SimpleGrid columns={3} spacing={6}>
            <Box bg={C.surface} p={6} borderRadius="lg" borderWidth="1px" borderColor={C.border} textAlign="center" shadow="sm">
              <CircularProgress value={compliancePercentage} color="blue.400" size="120px">
                <CircularProgressLabel color={C.text}>{compliancePercentage}%</CircularProgressLabel>
              </CircularProgress>
              <Text mt={4} color={C.text} fontWeight="600">Daily Compliance Health</Text>
              <Text fontSize="xs" color={C.textMid}>Faculty updating status on time</Text>
            </Box>
            <Box bg={C.surface} p={6} borderRadius="lg" borderWidth="1px" borderColor={C.border} shadow="sm">
               <Heading size="md" color={C.text} mb={4}>Live Board Analytics</Heading>
               <Text color={C.textMid} fontSize="sm">System is active. For consultation-pattern analytics and reports, use the "Reports & Analytics" tab. For the detailed status log, use "Faculty Roster."</Text>
            </Box>
          </SimpleGrid>
        )}

        {(activePage === 'reports' || activePage === 'records') && (
          // See AdminDashboard.tsx for the same pattern, explained: hides
          // everything except #print-area when printing/saving as PDF.
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #print-area, #print-area * { visibility: visible; }
              #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
              .no-print { display: none !important; }
            }
          `}</style>
        )}

        {activePage === 'reports' && (
          <Box id="print-area" bg={C.surface} p={6} borderRadius="lg" borderWidth="1px" borderColor={C.border} shadow="sm">
            <HStack justifyContent="space-between" mb={6} className="no-print">
              <Text color={C.textMid} fontSize="sm">Computed from all {appointments.length} appointments on record.</Text>
              <ChakraButton size="sm" colorScheme="blue" onClick={() => window.print()}>Print Report</ChakraButton>
            </HStack>
            <Box sx={{ display: 'none', '@media print': { display: 'block' } }} mb={4}>
              <Heading size="md" color={C.text}>Reports & Analytics</Heading>
              <Text fontSize="sm" color={C.textMid}>Generated {new Date().toLocaleString()}</Text>
            </Box>

            <VStack align="stretch" spacing={8}>
              <Box>
                <Heading size="sm" color={C.textMid} textTransform="uppercase" mb={4}>Appointments by Status</Heading>
                <SimpleBarChart data={statusCounts} color="#2563eb" />
              </Box>
              <Box>
                <Heading size="sm" color={C.textMid} textTransform="uppercase" mb={4}>Appointments per Week (last 8 weeks)</Heading>
                <SimpleBarChart data={weeklyTrend} color="#16a34a" />
              </Box>
              <Box>
                <Heading size="sm" color={C.textMid} textTransform="uppercase" mb={4}>Faculty Utilization (completed consultations)</Heading>
                {facultyUtilization.length > 0
                  ? <SimpleBarChart data={facultyUtilization} color="#f08a3c" />
                  : <Text color={C.textMid} fontSize="sm">No completed consultations yet.</Text>}
              </Box>
            </VStack>
          </Box>
        )}

        {activePage === 'records' && (
          <Box id="print-area" bg={C.surface} p={6} borderRadius="lg" borderWidth="1px" borderColor={C.border} shadow="sm">
            <HStack justifyContent="space-between" mb={4} className="no-print">
              <input
                placeholder="Search by student, faculty, or reason..."
                value={recordsSearch}
                onChange={(e) => setRecordsSearch(e.target.value)}
                style={{ maxWidth: '320px', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${C.border}`, background: 'transparent', color: C.text }}
              />
              <ChakraButton size="sm" colorScheme="blue" onClick={() => window.print()}>Print Report</ChakraButton>
            </HStack>
            <Box sx={{ display: 'none', '@media print': { display: 'block' } }} mb={4}>
              <Heading size="md" color={C.text}>Consultation Records</Heading>
              <Text fontSize="sm" color={C.textMid}>Generated {new Date().toLocaleString()}</Text>
            </Box>

            <TableContainer>
              <Table variant="simple" size="sm">
                <Thead>
                  <Tr>
                    <Th color={C.textMid}>Date Signed Off</Th>
                    <Th color={C.textMid}>Student</Th>
                    <Th color={C.textMid}>Faculty</Th>
                    <Th color={C.textMid}>Case Presented</Th>
                    <Th color={C.textMid}>Intervention Taken</Th>
                    <Th color={C.textMid}>Remarks</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredRecords.length === 0 && (
                    <Tr><Td colSpan={6}><Text color={C.textMid} py={4} textAlign="center">No completed consultations found.</Text></Td></Tr>
                  )}
                  {filteredRecords.map((r: any) => (
                    <Tr key={r._id}>
                      <Td color={C.text}>{r.completedAt ? new Date(r.completedAt).toLocaleDateString() : ''}</Td>
                      <Td fontWeight="bold" color={C.text}>{r.studentName} ({r.studentSection})</Td>
                      <Td color={C.text}>{r.facultyId?.name || 'Unknown'}</Td>
                      <Td maxW="200px" color={C.text}>{r.casePresented}</Td>
                      <Td maxW="200px" color={C.text}>{r.interventionTaken}</Td>
                      <Td maxW="160px" color={C.text}>{r.remarks}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {activePage === 'roster' && (
          <Box bg={C.surface} p={6} borderRadius="lg" borderWidth="1px" borderColor={C.border} shadow="sm">
            <HStack justifyContent="space-between" mb={6}>
              <Heading size="md" color={C.text}>CCIS Faculty Roster</Heading>
              <ChakraButton size="sm" colorScheme="blue" onClick={handleExportCSV}>Export CSV Report</ChakraButton>
            </HStack>
            <TableContainer>
              <Table variant="simple" size="sm">
                <Thead><Tr><Th color={C.textMid}>Name</Th><Th color={C.textMid}>Position</Th><Th color={C.textMid}>Live Status</Th><Th color={C.textMid}>Location</Th></Tr></Thead>
                <Tbody>
                  {facultyRoster.map((prof) => (
                    <Tr key={prof._id}>
                      <Td fontWeight="bold" color={C.text}>{prof.name}</Td>
                      <Td color={C.text}>{prof.programPosition}</Td>
                      <Td><Badge colorScheme={prof.currentStatus === 'AVAILABLE' ? 'green' : 'gray'}>{prof.currentStatus}</Badge></Td>
                      <Td color={C.text}>{prof.currentLocation || prof.room || 'N/A'}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>
    </Flex>
  );
}