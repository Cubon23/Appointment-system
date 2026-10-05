import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Heading, Table, Thead, Tbody, Tr, Th, Td, TableContainer,
  Badge, Text, Button as ChakraButton, HStack, Flex, VStack,
  useColorMode, SimpleGrid, CircularProgress, CircularProgressLabel
} from '@chakra-ui/react';
import { authFetch } from './authFetch';
import NotificationBell from './NotificationBell';

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
  const [activePage, setActivePage] = useState<'analytics' | 'roster'>('analytics');
  
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

  const fetchData = () => {
    // Phase 1 Analytics: Pull live board data
    authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/status`)
      .then((res) => res.json())
      .then((data) => setFacultyRoster(data));
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
               <Text color={C.textMid} fontSize="sm">System is active. For detailed status logs and report generation, navigate to the Faculty Roster tab.</Text>
            </Box>
          </SimpleGrid>
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