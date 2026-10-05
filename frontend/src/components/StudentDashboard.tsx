import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Heading, Text, Button as ChakraButton, Table, Thead, Tbody, Tr, Th, Td, TableContainer,
  Badge, Input, VStack, HStack, useToast, FormControl, FormLabel, Textarea, Flex,
  useColorMode, useColorModeValue
} from '@chakra-ui/react';
import { authFetch } from './authFetch';
import NotificationBell from './NotificationBell';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'AVAILABLE': return 'green'; case 'IN_CLASS': return 'blue';
    case 'IN_MEETING': return 'yellow'; case 'ON_BREAK': return 'orange';
    case 'OUT_OF_OFFICE': return 'gray'; case 'ON_LEAVE': return 'purple'; case 'ABSENT': return 'red';
    default: return 'gray';
  }
};

// Matches the dayOfWeek convention used on the faculty side (1 = Mon ... 6 = Sat)
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StudentDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const userName = localStorage.getItem('userName') || 'Student';
  const userId = localStorage.getItem('userId') || '';
  const { colorMode, toggleColorMode } = useColorMode();

  const [activePage, setActivePage] = useState('home');
  const [faculty, setFaculty] = useState<any[]>([]);
  const [studentSection, setStudentSection] = useState(localStorage.getItem('programPosition') || '');

  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  const [facultySchedule, setFacultySchedule] = useState<any[]>([]);
  const [facultyConsultHours, setFacultyConsultHours] = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [aptDate, setAptDate] = useState('');
  const [aptTime, setAptTime] = useState('');
  const [aptReason, setAptReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [myRequests, setMyRequests] = useState<any[]>([]);

  // ── Custom Theme Tokens ───────────────────────────────────────────────
  const dk = colorMode === 'dark';
  const C = {
    pageBg:    dk ? "#0c1421" : "#eef2f7",
    sidebar:   dk ? "#070e1b" : "#0f2240",
    text:      dk ? "#e8f0fe" : "#0f2240",
    navText:   dk ? "#7a93b0" : "#8eaecb",
    navActive: dk ? "#ffffff" : "#ffffff",
    navBg:     dk ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.10)",
  };
  const btnBase: React.CSSProperties = { border: "none", cursor: "pointer", fontFamily: "inherit", letterSpacing:"0.01em" };

  const cardBg = useColorModeValue('#ffffff', '#111d30');
  const borderColor = useColorModeValue('#dde3ec', '#1e3048');
  const textColor = useColorModeValue('#0f2240', '#e8f0fe');
  const mutedText = useColorModeValue('#6b7fa0', '#7a93b0');
  const facultyRowHoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const fetchData = () => {
    authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/status`)
      .then(res => res.json())
      .then(data => setFaculty(data));
    if (userId) {
      authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointments/student/${userId}`)
        .then(res => res.json())
        .then(data => setMyRequests(data));
    }
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const normalized = timeStr.replace(/-/g, ':');
    const parts = normalized.split(':');
    if (parts.length < 2) return normalized;
    const hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');
    if (Number.isNaN(hours)) return normalized;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${h12}:${minutes} ${ampm}`;
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 5000);
    return () => clearInterval(intervalId);
  }, [userId]);

  // When a professor is chosen, pull their weekly hours so the student can pick
  // a real open slot. We only ever read startTime/endTime/dayOfWeek from these
  // responses below — subject, room, and any faculty-private notes are never
  // rendered, regardless of what the API happens to include.
  useEffect(() => {
    if (!selectedFaculty) {
      setFacultySchedule([]);
      setFacultyConsultHours([]);
      return;
    }
    setScheduleLoading(true);
    Promise.all([
      authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/my-schedule/${selectedFaculty}`).then(res => res.json()),
      authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/consultation-hours/${selectedFaculty}`).then(res => res.json())
    ])
      .then(([schedule, consultHours]) => {
        setFacultySchedule(Array.isArray(schedule) ? schedule : []);
        setFacultyConsultHours(Array.isArray(consultHours) ? consultHours : []);
      })
      .catch(() => {
        setFacultySchedule([]);
        setFacultyConsultHours([]);
      })
      .finally(() => setScheduleLoading(false));
  }, [selectedFaculty]);

  // Build a day-by-day list of blocked ("Class Hours") vs bookable ("Consultation Hours")
  // time ranges. Only startTime/endTime/dayOfWeek are read from the source objects.
  const weeklyHoursByDay = React.useMemo(() => {
    const byDay: Record<number, { label: string; start: string; end: string }[]> = {};
    for (let i = 0; i < 6; i++) byDay[i] = [];

    facultySchedule.forEach((sched: any) => {
      const dayIndex = (sched.dayOfWeek ?? 1) - 1;
      if (dayIndex < 0 || dayIndex > 5) return;
      byDay[dayIndex].push({ label: 'Class Hours', start: sched.startTime, end: sched.endTime });
    });

    facultyConsultHours.forEach((block: any) => {
      const dayIndex = (block.dayOfWeek ?? 1) - 1;
      if (dayIndex < 0 || dayIndex > 5) return;
      byDay[dayIndex].push({ label: 'Consultation Hours', start: block.startTime, end: block.endTime });
    });

    Object.values(byDay).forEach(entries => entries.sort((a, b) => (a.start > b.start ? 1 : -1)));
    return byDay;
  }, [facultySchedule, facultyConsultHours]);

  const filteredFaculty = faculty.filter(f =>
    f.name.toLowerCase().includes(facultySearch.toLowerCase())
  );

  const selectedFacultyObj = faculty.find(f => f._id === selectedFaculty);

  const handleAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName: userName, studentSection, facultyId: selectedFaculty, date: aptDate, time: aptTime, reason: aptReason })
      });

      // 1. We must parse the JSON to read the custom error message from the backend
      const data = await response.json();

      // 2. === THE INTERCEPTOR ===
      // If the backend threw a 400 Bad Request (Class collision, Double-booking, or Spam)
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request appointment.');
      }

      // 3. If it was mathematically safe and successful:
      toast({ 
        title: 'Appointment Requested!', 
        description: 'Your request is now pending professor approval.',
        status: 'success', 
        duration: 3000,
        isClosable: true
      });
      
      setSelectedFaculty(''); setAptDate(''); setAptTime(''); setAptReason('');
      setActivePage('requests'); 
      fetchData(); 
      
    } catch (error: any) { 
      // 4. === THE SPAM BLOCKER TOAST ===
      // Catches the backend error and displays it loudly at the top of the screen
      toast({ 
        title: 'Time Slot Unavailable', 
        description: error.message,
        status: 'error', 
        duration: 6000, // Stays visible long enough for the student to read it
        isClosable: true,
        position: 'top'
      }); 
    }
    
    setIsSubmitting(false);
  };

  const handleCancelAppointment = async (id: string) => {
    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointment/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED BY STUDENT' })
      });
      if (response.ok) {
        toast({ title: `Appointment Cancelled`, status: 'info' });
        fetchData();
      }
    } catch (error) {}
  };

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: C.pageBg, fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.text, overflow: "hidden" }}>
      
      {/* ── Custom Sidebar ── */}
      <aside style={{ width: "196px", flexShrink: 0, background: C.sidebar, display: "flex", flexDirection: "column", padding: "22px 14px" }}>
        <div style={{ padding: "4px 8px 28px" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.14em", color: "#fff", textTransform: "uppercase" }}>Student Portal</span>
          <div style={{ marginTop: "7px", width: "20px", height: "3px", background: "#2563eb", borderRadius: "2px" }} />
        </div>

        <NotificationBell navText={C.navText} navBg={C.navBg} />

        <nav style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {[
            { page: "home", label: "Faculty Status" },
            { page: "appointments", label: "Book Consultation" },
            { page: "requests", label: "My Requests" }
          ].map(({ page, label }) => {
            const active = activePage === page;
            return (
              <button key={page} onClick={() => setActivePage(page)} style={{
                  ...btnBase, display: "flex", alignItems: "center", gap: "10px", padding: "9px 10px", borderRadius: "7px",
                  background: active ? C.navBg : "transparent", color: active ? C.navActive : C.navText,
                  fontWeight: active ? 600 : 400, fontSize: "13px", textAlign: "left",
                  borderLeft: active ? "2px solid #2563eb" : "2px solid transparent", transition: "all 0.15s ease",
                }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: active ? "#60a5fa" : "transparent", border: active ? "none" : "1.5px solid #3a5373", flexShrink: 0 }} />
                {label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />
        <button onClick={toggleColorMode} style={{ ...btnBase, padding: "9px 12px", borderRadius: "7px", border: `1px solid ${dk ? "#1e3048" : "rgba(255,255,255,0.12)"}`, background: "transparent", color: C.navText, fontSize: "12px", textAlign: "left", display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span>{dk ? "☀" : "☾"}</span> {dk ? "Light Mode" : "Dark Mode"}
        </button>
        <button onClick={() => { localStorage.clear(); navigate('/'); }} style={{ ...btnBase, padding: "9px 12px", borderRadius: "7px", background: "#dc2626", color: "#fff", fontSize: "12px", fontWeight: 600 }}>Logout</button>
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div style={{ padding: "32px", overflowY: "auto", height: "100%" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "20px", color: textColor }}>
            {activePage === 'home' && "Live Faculty Status"}
            {activePage === 'appointments' && "Schedule a Consultation"}
            {activePage === 'requests' && "My Appointment Requests"}
          </h1>

          {activePage === 'home' && (
            <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
              <TableContainer>
                <Table variant="simple" size="md">
                  <Thead><Tr><Th color={mutedText}>Faculty Name</Th><Th color={mutedText}>Live Status & Location</Th><Th color={mutedText}>Announcements / Notices</Th></Tr></Thead>
                  <Tbody>
                    {faculty.map((prof) => {
                      const isMissing = prof.currentStatus === 'ABSENT' || prof.currentStatus === 'ON_LEAVE';
                      return (
                        <Tr key={prof._id}>
                          <Td fontWeight="bold" color={textColor}>
                            <Text>{prof.name}</Text>
                            <Text fontSize="xs" color={mutedText} fontWeight="normal">{prof.programPosition}</Text>
                          </Td>
                          <Td>
                            <HStack>
                              <Badge colorScheme={getStatusColor(prof.currentStatus)} px={3} py={1} borderRadius="full">{prof.currentStatus.replace(/_/g, ' ')}</Badge>
                              <Text color={isMissing ? 'red.500' : textColor} fontWeight={isMissing ? 'bold' : 'normal'} fontSize="sm">
                                {isMissing ? 'Not on Campus' : (prof.currentLocation || prof.room || 'N/A')}
                              </Text>
                            </HStack>
                          </Td>
                          <Td maxW="300px">
                            <VStack align="start" spacing={1}>
                              {prof.noticeMessage && <Badge colorScheme="blue" textTransform="none" whiteSpace="normal" p={2} borderRadius="md">📢 {prof.noticeMessage}</Badge>}
                              {prof.flaggedDate && <Badge colorScheme="orange" textTransform="none" p={2} borderRadius="md">🗓️ Out on {prof.flaggedDate} {prof.flaggedReason ? `(${prof.flaggedReason})` : ''}</Badge>}
                              {!prof.noticeMessage && !prof.flaggedDate && <Text color={mutedText} fontSize="sm">No current notices</Text>}
                            </VStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {activePage === 'appointments' && (
            <Flex gap={6} align="flex-start" wrap="wrap">
              <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm" w="600px" maxW="100%">
                <form onSubmit={handleAppointmentSubmit}>
                  <VStack spacing={4}>
                    <FormControl isRequired><FormLabel color={textColor}>Your Section</FormLabel><Input value={studentSection} onChange={(e) => setStudentSection(e.target.value)} placeholder="e.g. BS INFO 3D" color={textColor} borderColor={borderColor}/></FormControl>
                    <FormControl isRequired>
                      <FormLabel color={textColor}>Select Professor</FormLabel>
                      <Input
                        placeholder="Search professor by name..."
                        value={selectedFacultyObj ? selectedFacultyObj.name : facultySearch}
                        onChange={(e) => { setFacultySearch(e.target.value); setSelectedFaculty(''); }}
                        color={textColor} borderColor={borderColor} mb={2}
                      />
                      {!selectedFaculty && facultySearch && (
                        <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" maxH="180px" overflowY="auto">
                          {filteredFaculty.length === 0 && (
                            <Text p={3} fontSize="sm" color={mutedText}>No professors found.</Text>
                          )}
                          {filteredFaculty.map(f => {
                            const unavailable = f.currentStatus === 'ABSENT' || f.currentStatus === 'ON_LEAVE';
                            return (
                              <Box
                                key={f._id}
                                p={3}
                                cursor={unavailable ? 'not-allowed' : 'pointer'}
                                opacity={unavailable ? 0.5 : 1}
                                _hover={unavailable ? {} : { bg: facultyRowHoverBg }}
                                onClick={() => { if (!unavailable) { setSelectedFaculty(f._id); setFacultySearch(''); } }}
                              >
                                <Text fontWeight="600" color={textColor} fontSize="sm">{f.name} {unavailable ? '(Unavailable)' : ''}</Text>
                                <Text fontSize="xs" color={mutedText}>{f.programPosition}</Text>
                              </Box>
                            );
                          })}
                        </Box>
                      )}
                      {selectedFaculty && (
                        <ChakraButton size="xs" variant="link" colorScheme="blue" onClick={() => { setSelectedFaculty(''); setFacultySearch(''); }}>Change professor</ChakraButton>
                      )}
                    </FormControl>
                    <HStack w="100%" alignItems="flex-start">
  <FormControl isRequired>
    <FormLabel color={textColor}>Date</FormLabel>
    <Input type="date" value={aptDate} onChange={(e) => setAptDate(e.target.value)} color={textColor} borderColor={borderColor}/>
  </FormControl>
  <FormControl isRequired>
    <FormLabel color={textColor}>Time</FormLabel>
    {/* Added min and max constraints directly to the HTML input */}
    <Input type="time" value={aptTime} onChange={(e) => setAptTime(e.target.value)} min="07:30" max="16:00" color={textColor} borderColor={borderColor}/>
    {/* Added helper text to guide the student */}
    <Text fontSize="xs" color={mutedText} mt={1}>7:30 AM - 4:00 PM</Text>
  </FormControl>
</HStack>
                    <FormControl isRequired><FormLabel color={textColor}>Purpose of Meeting</FormLabel>
                      <Textarea placeholder="e.g., Thesis consultation, Grade inquiry..." value={aptReason} onChange={(e) => setAptReason(e.target.value)} color={textColor} borderColor={borderColor} />
                    </FormControl>
                    <ChakraButton type="submit" colorScheme="blue" w="100%" isLoading={isSubmitting} size="lg">Submit Appointment Request</ChakraButton>
                  </VStack>
                </form>
              </Box>

              <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm" flex="1" minW="280px">
                <Heading size="sm" color={textColor} mb={4}>
                  {selectedFacultyObj ? `${selectedFacultyObj.name}'s Weekly Hours` : 'Select a professor to view their hours'}
                </Heading>
                {!selectedFaculty && (
                  <Text fontSize="sm" color={mutedText}>Search and choose a professor on the left to see when they're in class versus available for consultation.</Text>
                )}
                {selectedFaculty && scheduleLoading && (
                  <Text fontSize="sm" color={mutedText}>Loading schedule...</Text>
                )}
                {selectedFaculty && !scheduleLoading && (
                  <VStack align="stretch" spacing={3}>
                    {DAY_LABELS.map((day, i) => (
                      <Box key={day}>
                        <Text fontWeight="600" fontSize="sm" color={textColor} mb={1}>{day}</Text>
                        {weeklyHoursByDay[i].length === 0 ? (
                          <Text fontSize="xs" color={mutedText} pl={2}>No scheduled hours</Text>
                        ) : (
                          <VStack align="stretch" spacing={1} pl={2}>
                            {weeklyHoursByDay[i].map((entry, idx) => (
                              <HStack key={idx} justify="space-between">
                                <Badge colorScheme={entry.label === 'Class Hours' ? 'gray' : 'green'} textTransform="none" px={2} py={0.5} borderRadius="md">
                                  {entry.label}
                                </Badge>
                                <Text fontSize="xs" color={mutedText}>{formatTime(entry.start)} – {formatTime(entry.end)}</Text>
                              </HStack>
                            ))}
                          </VStack>
                        )}
                      </Box>
                    ))}
                  </VStack>
                )}
              </Box>
            </Flex>
          )}

          {activePage === 'requests' && (
            <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
              <TableContainer>
                <Table variant="simple" size="sm">
                  <Thead><Tr><Th color={mutedText}>Professor</Th><Th color={mutedText}>Date/Time</Th><Th color={mutedText}>Reason</Th><Th color={mutedText}>Status</Th><Th color={mutedText}>Action</Th></Tr></Thead>
                  <Tbody>
                    {myRequests.map(apt => (
                      <Tr key={apt._id}>
                        <Td fontWeight="bold" color={textColor}>{apt.facultyId ? apt.facultyId.name : 'Unknown'}</Td>
                        <Td color={textColor}>{apt.date} {formatTime(apt.time)}</Td>
                        <Td maxW="200px" isTruncated color={textColor}>{apt.reason}</Td>
                        <Td>
                          <Badge colorScheme={apt.status === 'APPROVED' ? 'green' : apt.status === 'REJECTED' ? 'red' : apt.status === 'PENDING' ? 'yellow' : 'gray'} px={2} py={1} borderRadius="md">{apt.status}</Badge>
                        </Td>
                        <Td>
                          {apt.status === 'PENDING' && (
                            <ChakraButton size="xs" colorScheme="gray" variant="outline" onClick={() => handleCancelAppointment(apt._id)}>Cancel Request</ChakraButton>
                          )}
                        </Td>
                      </Tr>
                    ))}
                    {myRequests.length === 0 && <Tr><Td colSpan={5} textAlign="center" py={10} color={mutedText}>You have no appointment requests.</Td></Tr>}
                  </Tbody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </div>
      </main>
    </div>
    
  );
}