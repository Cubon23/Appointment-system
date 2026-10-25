import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cohortConfig } from '../data/cohortConfig';
import { formatDate, formatDateTime } from './dateUtils';
import BroadcastBanner from './BroadcastBanner';
import OnboardingModal from './OnboardingModal';
import PrivacyPolicyModal from './PrivacyPolicyModal';
import {
  Box, Heading, Text, Button as ChakraButton, Table, Thead, Tbody, Tr, Th, Td, TableContainer,
  Badge, Input, Select, VStack, HStack, useToast, FormControl, FormLabel, Textarea, Flex,
  useColorMode, useColorModeValue,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, useDisclosure
} from '@chakra-ui/react';
import { authFetch } from './authFetch';
import LogoutConfirm from './LogoutConfirm';
import { statusColor, statusLabel, isBeforeCutoff, hasStarted, BOOKING_LEAD_HOURS, CANCEL_CUTOFF_HOURS } from './appointmentStatus';
import NotificationBell from './NotificationBell';
import CancelReasonPicker, { STUDENT_CANCEL_REASONS } from './CancelReasonPicker';
import AppealControls from './AppealControls';

const PURPOSE_OPTIONS = [
  'Capstone / Thesis Consultation',
  'Programming / Code Debugging Assistance',
  'Academic Advising / Curriculum & Subject Enlistment',
  'OJT / Internship / Practicum Guidance',
  'Grade Dispute / Clearance for "INC" (Incomplete)',
  'Exam / Quiz Result Review',
  'Submission of Delayed Work / Make-up Requirements',
  'Others',
];

// "2026-10-19" -> "Mon, Oct 19" (T00:00:00 keeps it in local time, see dateUtils.ts)
const formatDatePreview = (val: string) => {
  if (!val) return '';
  const d = new Date(`${val}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'AVAILABLE':       return 'green';
    case 'IN_CLASS':        return 'blue';
    case 'IN_CONSULTATION': return 'teal';
    case 'IN_MEETING':      return 'yellow';
    case 'ON_BREAK':        return 'orange';
    case 'OUT_OF_OFFICE':   return 'gray';
    case 'ON_LEAVE':        return 'purple';
    case 'ABSENT':          return 'red';
    default:                return 'gray';
  }
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    AVAILABLE:       'Available',
    IN_CLASS:        'In Class',
    IN_CONSULTATION: 'Consultation Hours',
    IN_MEETING:      'In a Meeting',
    ON_BREAK:        'On Break',
    OUT_OF_OFFICE:   'Out of Office',
    ON_LEAVE:        'On Leave',
    ABSENT:          'Absent',
    NOT_UPDATED:     'No Update',
  };
  return labels[status] ?? status;
};

// Matches the dayOfWeek convention used on the faculty side (1 = Mon ... 6 = Sat)
export default function StudentDashboard() {
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const toast = useToast();
  const userName = localStorage.getItem('userName') || 'Student';
  const userId = localStorage.getItem('userId') || '';
  // Read-only mode: until the profile (incl. a valid ID) is complete, students can browse but not book.
  const profileComplete = localStorage.getItem('onboardingComplete') !== 'false';
  const { isOpen: isProfileOpen, onOpen: onProfileOpen, onClose: onProfileClose } = useDisclosure();
  const { isOpen: isPrivacyOpen, onOpen: onPrivacyOpen, onClose: onPrivacyClose } = useDisclosure();
  useEffect(() => { if (!profileComplete) onProfileOpen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { colorMode, toggleColorMode } = useColorMode();

  const [activePage, setActivePage] = useState('home');
  const [faculty, setFaculty] = useState<any[]>([]);
  const [studentSection] = useState(localStorage.getItem('programPosition') || '');

  // Faculty Status: search + filters (Gender, Position, Status) and the master-schedule dialog
  const [statusSearch, setStatusSearch] = useState('');
  const [fGender, setFGender] = useState('');
  const [fPosition, setFPosition] = useState('');
  const [fStatus, setFStatus] = useState('');
  const { isOpen: isMasterOpen, onOpen: onMasterOpen, onClose: onMasterClose } = useDisclosure();
  const [masterFaculty, setMasterFaculty] = useState<any>(null);
  const [masterData, setMasterData] = useState<{ classes: any[]; official: any[]; added: any[] }>({ classes: [], official: [], added: [] });
  const [masterLoading, setMasterLoading] = useState(false);

  const openMaster = (prof: any) => {
    setMasterFaculty(prof); setMasterLoading(true); onMasterOpen();
    const base = `${import.meta.env.VITE_API_URL}/api/faculty`;
    Promise.all([
      authFetch(`${base}/my-schedule/${prof._id}`).then(r => r.json()),
      authFetch(`${base}/consultation-hours/${prof._id}`).then(r => r.json()),
      authFetch(`${base}/added-hours/of/${prof._id}`).then(r => r.json()),
    ])
      .then(([classes, official, added]) => setMasterData({
        classes: Array.isArray(classes) ? classes : [], official: Array.isArray(official) ? official : [], added: Array.isArray(added) ? added : [],
      }))
      .catch(() => setMasterData({ classes: [], official: [], added: [] }))
      .finally(() => setMasterLoading(false));
  };

  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  // Bookable slots for the chosen professor (hourly pieces of official + added consultation hours, next 4 weeks)
  const [slots, setSlots] = useState<any[]>([]);
  const [maxPending, setMaxPending] = useState(3);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(''); // "YYYY-MM-DD|HH:MM"
  const [aptReason, setAptReason] = useState('');
  const [aptPurpose, setAptPurpose] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const { isOpen: isSummaryOpen, onOpen: onSummaryOpen, onClose: onSummaryClose } = useDisclosure();
  const [summaryApt, setSummaryApt] = useState<any>(null);
  const viewAccomplishment = (apt: any) => { setSummaryApt(apt); onSummaryOpen(); };

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

  // When a professor is chosen, load their open consultation slots. Refreshed every 15 s so the
  // pending counts and taken slots stay current while the student is choosing.
  useEffect(() => {
    setSelectedSlot('');
    if (!selectedFaculty) { setSlots([]); return; }
    let alive = true;
    const load = (first: boolean) => {
      if (first) setScheduleLoading(true);
      authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/slots/${selectedFaculty}`)
        .then(res => res.json())
        .then(data => { if (alive && Array.isArray(data.slots)) { setSlots(data.slots); setMaxPending(data.maxPending || 3); } })
        .catch(() => { if (alive && first) setSlots([]); })
        .finally(() => { if (alive && first) setScheduleLoading(false); });
    };
    load(true);
    const id = setInterval(() => load(false), 15000);
    return () => { alive = false; clearInterval(id); };
  }, [selectedFaculty]);

  // Slots grouped by date for the weekly-hours panel.
  const slotsByDate = React.useMemo(() => {
    const m: Record<string, any[]> = {};
    slots.forEach(sl => { (m[sl.date] = m[sl.date] || []).push(sl); });
    return Object.entries(m);
  }, [slots]);

  const slotKey = (sl: any) => `${sl.date}|${sl.start}`;
  const slotLabel = (sl: any) => `${formatDatePreview(sl.date)} · ${formatTime(sl.start)} – ${formatTime(sl.end)}`;
  const chosenSlot = slots.find(sl => slotKey(sl) === selectedSlot);

  // Professors the student has booked before, most recent first (shown by default and pinned to the top).
  const recommendedIds: string[] = React.useMemo(() => {
    const seen: string[] = [];
    myRequests.forEach((r: any) => { const id = r.facultyId?._id; if (id && !seen.includes(id)) seen.push(id); });
    return seen;
  }, [myRequests]);

  const positionOptions = Array.from(new Set(faculty.map(f => (f.programPosition || '').trim()).filter(Boolean))).sort();
  const statusGroups: Record<string, string[]> = {
    IN_CLASS: ['IN_CLASS'], IN_CONSULTATION: ['IN_CONSULTATION'], LEAVE_ABSENT: ['ON_LEAVE', 'ABSENT'],
  };
  const namedStatuses = Object.values(statusGroups).flat();
  const matchesStatus = (st: string) => fStatus === 'OTHER' ? !namedStatuses.includes(st) : statusGroups[fStatus].includes(st);
  const statusFiltered = faculty.filter(f =>
    f.name.toLowerCase().includes(statusSearch.toLowerCase()) &&
    (!fGender || f.gender === fGender) &&
    (!fPosition || (f.programPosition || '').trim() === fPosition) &&
    (!fStatus || matchesStatus(f.currentStatus))
  );

  const matchingFaculty = faculty.filter(f => f.name.toLowerCase().includes(facultySearch.toLowerCase()));
  const recommendedFaculty = recommendedIds.map(id => matchingFaculty.find(f => f._id === id)).filter(Boolean) as any[];
  // With nothing typed only the recommendations show; once the student types, they stay pinned on top.
  const filteredFaculty = [
    ...recommendedFaculty,
    ...(facultySearch.trim() ? matchingFaculty.filter(f => !recommendedIds.includes(f._id)) : []),
  ];

  const selectedFacultyObj = faculty.find(f => f._id === selectedFaculty);

  // Validates "Your Section" against the real program/year/section structure (e.g. "BS INFO 4D"),
  // rather than trusting whatever was typed. Returns an error message, or null if valid.
  const validateStudentSection = (input: string): string | null => {
    const trimmed = input.trim();
    const match = trimmed.match(/^(.+)\s(\d)([A-Za-z])$/);
    if (!match) return 'Format must be like "BS INFO 4D" (program, year, section).';
    const [, program, year, letter] = match;
    const section = letter.toUpperCase();
    if (!cohortConfig[program]) return `"${program}" isn't a recognized program.`;
    if (!cohortConfig[program][year]) return `Year ${year} isn't valid for ${program}.`;
    if (!cohortConfig[program][year].includes(section)) return `Section ${section} isn't valid for ${program} Year ${year}.`;
    return null;
  };

  const handleAppointmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileComplete) {
      toast({ title: 'Read-only mode', description: 'Complete your profile details and ID verification to unlock consultation requests.', status: 'warning', position: 'top' });
      return;
    }

    const sectionError = validateStudentSection(studentSection);
    if (sectionError) {
      toast({ title: 'Invalid section', description: sectionError, status: 'warning' });
      return;
    }

    if (!chosenSlot) {
      toast({ title: 'Choose a time', description: 'Select an available consultation slot.', status: 'warning', position: 'top' });
      return;
    }

    if (!aptReason.trim()) {
      toast({
        title: 'Purpose of Meeting required',
        description: aptPurpose === 'Others'
          ? 'Please specify your purpose in the text box.'
          : 'Please select a purpose of meeting.',
        status: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName: userName, studentSection, facultyId: selectedFaculty, date: chosenSlot.date, time: chosenSlot.start, reason: aptReason })
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
      
      setSelectedFaculty(''); setSelectedSlot(''); setAptReason(''); setAptPurpose('');
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

  // Cancelling (pending or approved) asks for a reason first
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const handleCancelAppointment = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointment/${cancelTarget._id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED BY STUDENT', reason: cancelReason })
      });
      if (response.ok) {
        toast({ title: `Appointment Cancelled`, status: 'info' });
        setCancelTarget(null);
        fetchData();
      } else {
        const data = await response.json().catch(() => ({}));
        toast({ title: 'Could not cancel', description: data.error || 'Please try again.', status: 'error' });
      }
    } catch (error) {
      toast({ title: 'Could not cancel', description: 'Network error. Please try again.', status: 'error' });
    } finally { setCancelBusy(false); }
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
        <button onClick={() => setLogoutOpen(true)} style={{ ...btnBase, padding: "9px 12px", borderRadius: "7px", background: "#dc2626", color: "#fff", fontSize: "12px", fontWeight: 600 }}>Logout</button>
        <LogoutConfirm isOpen={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={() => { localStorage.clear(); navigate('/'); }} />
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <BroadcastBanner userRole="STUDENT" />
        <div style={{ padding: "32px", overflowY: "auto", height: "100%" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "20px", color: textColor }}>
            {activePage === 'home' && "Live Faculty Status"}
            {activePage === 'appointments' && "Schedule a Consultation"}
            {activePage === 'requests' && "My Appointment Requests"}
          </h1>

          {activePage === 'home' && (
            <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
              <Flex gap={3} mb={4} wrap="wrap">
                <Input placeholder="Search faculty by name..." value={statusSearch} onChange={(e) => setStatusSearch(e.target.value)} maxW="280px" color={textColor} borderColor={borderColor} />
                <Select placeholder="Gender" value={fGender} onChange={(e) => setFGender(e.target.value)} maxW="150px" color={textColor} borderColor={borderColor}>
                  <option value="Male">Male</option><option value="Female">Female</option>
                </Select>
                <Select placeholder="Position" value={fPosition} onChange={(e) => setFPosition(e.target.value)} maxW="220px" color={textColor} borderColor={borderColor}>
                  {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
                <Select placeholder="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)} maxW="200px" color={textColor} borderColor={borderColor}>
                  <option value="IN_CLASS">In Class</option>
                  <option value="IN_CONSULTATION">In Consultation</option>
                  <option value="LEAVE_ABSENT">On Leave / Absent</option>
                  <option value="OTHER">Other (Available, Meeting, Break, Out of Office...)</option>
                </Select>
              </Flex>
              <TableContainer>
                <Table variant="simple" size="md">
                  <Thead><Tr><Th color={mutedText}>Faculty Name</Th><Th color={mutedText}>Live Status</Th><Th color={mutedText}>Announcements / Notices</Th></Tr></Thead>
                  <Tbody>
                    {statusFiltered.length === 0 && (
                      <Tr><Td colSpan={3}><Text color={mutedText} fontSize="sm">No faculty match your search or filters.</Text></Td></Tr>
                    )}
                    {statusFiltered.map((prof) => {
                      return (
                        <Tr key={prof._id}>
                          <Td fontWeight="bold" color={textColor}>
                            <Text cursor="pointer" color="blue.500" _hover={{ textDecoration: 'underline' }} onClick={() => openMaster(prof)} title="View master schedule">{prof.name}</Text>
                            <Text fontSize="xs" color={mutedText} fontWeight="normal">{prof.programPosition}</Text>
                          </Td>
                          <Td>
                            <HStack>
                              <Badge colorScheme={getStatusColor(prof.currentStatus)} px={3} py={1} borderRadius="full">
                                {getStatusLabel(prof.currentStatus)}
                              </Badge>
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
                {!profileComplete && (
                  <Box mb={4} p={4} borderRadius="md" bg="orange.50" borderWidth="1px" borderColor="orange.300" color="orange.900">
                    <Text fontWeight="bold" mb={1}>Read-only mode</Text>
                    <Text fontSize="sm" mb={3}>Complete your profile details and ID verification to unlock consultation requests.</Text>
                    <ChakraButton size="sm" colorScheme="orange" onClick={onProfileOpen}>Complete profile</ChakraButton>
                  </Box>
                )}
                <form onSubmit={handleAppointmentSubmit}>
                  <VStack spacing={4}>
                    <FormControl isRequired>
                      <FormLabel color={textColor}>Your Section</FormLabel>
                      <Input value={studentSection} isReadOnly color={textColor} borderColor={borderColor} bg={useColorModeValue('gray.50', 'whiteAlpha.100')} cursor="not-allowed" />
                      <Text fontSize="xs" color={mutedText} mt={1}>From your account registration. Contact an admin if this is wrong.</Text>
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel color={textColor}>Select Professor</FormLabel>
                      <Input
                        placeholder="Search professor by name..."
                        value={selectedFacultyObj ? selectedFacultyObj.name : facultySearch}
                        onChange={(e) => { setFacultySearch(e.target.value); setSelectedFaculty(''); }}
                        color={textColor} borderColor={borderColor} mb={2}
                      />
                      {!selectedFaculty && (facultySearch.trim() || filteredFaculty.length > 0) && (
                        <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" maxH="180px" overflowY="auto">
                          {!facultySearch.trim() && filteredFaculty.length > 0 && (
                            <Text px={3} pt={2} fontSize="xs" color={mutedText}>Booked before. Type to search all professors.</Text>
                          )}
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
                                <Text fontWeight="600" color={textColor} fontSize="sm">{f.name} {unavailable ? '(Unavailable)' : ''} {recommendedIds.includes(f._id) && <Badge ml={1} colorScheme="blue" fontSize="9px">Booked before</Badge>}</Text>
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
                    <FormControl isRequired>
                      <FormLabel color={textColor}>Time</FormLabel>
                      <Select
                        placeholder={!selectedFaculty ? 'Choose a professor first' : slots.length ? 'Select an available slot' : 'No open slots'}
                        value={selectedSlot}
                        onChange={(e) => setSelectedSlot(e.target.value)}
                        isDisabled={!selectedFaculty || slots.length === 0}
                        color={textColor} borderColor={borderColor}
                      >
                        {slots.map(sl => (
                          <option key={slotKey(sl)} value={slotKey(sl)} disabled={sl.full}>
                            {slotLabel(sl)}{sl.kind === 'ADDED' ? ' (added hours)' : ''}{sl.full ? ' (full)' : ''}
                          </option>
                        ))}
                      </Select>
                      <Text fontSize="xs" color={mutedText} mt={1}>
                        Pick from the list or click a slot on the right. Requests need at least {BOOKING_LEAD_HOURS} hrs notice. Default length is {chosenSlot ? `${chosenSlot.duration} minutes` : '1 hour'}; your professor can shorten it when accepting.
                      </Text>
                    </FormControl>
                    <FormControl isRequired><FormLabel color={textColor}>Purpose of Meeting</FormLabel>
                      <Select
                        placeholder="Select a purpose"
                        value={aptPurpose}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAptPurpose(value);
                          // For every option except "Others", the dropdown selection IS the reason
                          // sent to the backend. "Others" clears it so the student must type one in.
                          setAptReason(value === 'Others' ? '' : value);
                        }}
                        color={textColor} borderColor={borderColor}
                      >
                        {PURPOSE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </Select>
                      {aptPurpose === 'Others' && (
                        <Textarea
                          mt={2}
                          placeholder="Please specify your purpose..."
                          value={aptReason}
                          onChange={(e) => setAptReason(e.target.value)}
                          color={textColor} borderColor={borderColor}
                        />
                      )}
                    </FormControl>
                    <ChakraButton type="submit" colorScheme="blue" w="100%" isLoading={isSubmitting} isDisabled={!profileComplete} size="lg" title={profileComplete ? undefined : 'Complete your profile details and ID verification to unlock consultation requests.'}>Submit Appointment Request</ChakraButton>
                  </VStack>
                </form>
              </Box>

              <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm" flex="1" minW="280px">
                <Heading size="sm" color={textColor} mb={4}>
                  {selectedFacultyObj ? `${selectedFacultyObj.name}'s Weekly Hours` : 'Select a professor to view their hours'}
                </Heading>
                {!selectedFaculty && (
                  <Text fontSize="sm" color={mutedText}>Search and choose a professor on the left to see their open consultation slots.</Text>
                )}
                {selectedFaculty && scheduleLoading && (
                  <Text fontSize="sm" color={mutedText}>Loading schedule...</Text>
                )}
                {selectedFaculty && !scheduleLoading && slotsByDate.length === 0 && (
                  <Text fontSize="sm" color={mutedText}>No open consultation slots in the next 4 weeks.</Text>
                )}
                {selectedFaculty && !scheduleLoading && slotsByDate.length > 0 && (
                  <VStack align="stretch" spacing={3} maxH="520px" overflowY="auto" pr={1}>
                    <Text fontSize="xs" color={mutedText}>Official and added consultation hours, in 1-hour slots. Up to {maxPending} students can request the same slot; the professor accepts one.</Text>
                    {slotsByDate.map(([date, list]) => (
                      <Box key={date}>
                        <Text fontWeight="600" fontSize="sm" color={textColor} mb={1}>{formatDatePreview(date)}</Text>
                        <Flex wrap="wrap" gap={2}>
                          {list.map((sl: any) => {
                            const active = slotKey(sl) === selectedSlot;
                            return (
                              <ChakraButton
                                key={slotKey(sl)}
                                size="xs"
                                variant={active ? 'solid' : 'outline'}
                                colorScheme={sl.kind === 'ADDED' ? 'purple' : 'green'}
                                isDisabled={sl.full}
                                onClick={() => setSelectedSlot(slotKey(sl))}
                                title={sl.full ? 'Full: 3 pending requests' : `${sl.pending} of ${maxPending} request spots taken`}
                              >
                                {formatTime(sl.start)} – {formatTime(sl.end)}{sl.pending > 0 && !sl.full ? ` (${sl.pending}/${maxPending})` : ''}{sl.full ? ' (full)' : ''}
                              </ChakraButton>
                            );
                          })}
                        </Flex>
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
                        <Td color={textColor}>{formatDate(apt.date)} at {formatTime(apt.time)}</Td>
                        <Td maxW="200px" isTruncated color={textColor}>{apt.reason}</Td>
                        <Td>
                          <Badge colorScheme={statusColor(apt.status)} px={2} py={1} borderRadius="md">{statusLabel(apt.status)}</Badge>
                          {['CANCELLED BY FACULTY', 'CANCELLED BY STUDENT', 'REJECTED'].includes(apt.status) && apt.cancelReason && (
                            <Text fontSize="xs" color={mutedText} mt={1}>Reason: {apt.cancelReason}</Text>
                          )}
                          <AppealControls apt={apt} role="STUDENT" onChanged={fetchData} />
                        </Td>
                        <Td>
                          {apt.status === 'PENDING' && (
                            isBeforeCutoff(apt.date, apt.time) ? (
                              <ChakraButton size="xs" colorScheme="gray" variant="outline" onClick={() => { setCancelReason(''); setCancelTarget(apt); }}>Cancel Request</ChakraButton>
                            ) : !hasStarted(apt.date, apt.time) && (
                              <Text fontSize="xs" color={mutedText}>Can't be cancelled within {CANCEL_CUTOFF_HOURS} hrs of the requested time.</Text>
                            )
                          )}
                          {apt.status === 'APPROVED' && (
                            isBeforeCutoff(apt.date, apt.time) ? (
                              <ChakraButton size="xs" colorScheme="red" variant="outline" onClick={() => { setCancelReason(''); setCancelTarget(apt); }}>Cancel Appointment</ChakraButton>
                            ) : !hasStarted(apt.date, apt.time) && (
                              <Text fontSize="xs" color={mutedText}>Can't be cancelled within {CANCEL_CUTOFF_HOURS} hrs of the appointment.</Text>
                            )
                          )}
                          {apt.status === 'COMPLETED' && (
                            <ChakraButton size="xs" colorScheme="green" variant="outline" onClick={() => viewAccomplishment(apt)}>View Accomplishment</ChakraButton>
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

      {/* Cancel dialog: reason is required (dropdown, or "Others" to type one) */}
      <Modal isOpen={!!cancelTarget} onClose={() => !cancelBusy && setCancelTarget(null)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{cancelTarget?.status === 'APPROVED' ? 'Cancel this appointment?' : 'Cancel this request?'}</ModalHeader>
          <ModalCloseButton isDisabled={cancelBusy} />
          <ModalBody>
            {cancelTarget && (
              <Text fontSize="sm" mb={4} color={mutedText}>
                {cancelTarget.facultyId ? cancelTarget.facultyId.name : 'The professor'} — {formatDate(cancelTarget.date)} at {formatTime(cancelTarget.time)}.
                {cancelTarget.status === 'APPROVED' ? ' The professor already approved this, and will be notified.' : ''}
              </Text>
            )}
            {cancelTarget && (
              <CancelReasonPicker key={cancelTarget._id} options={STUDENT_CANCEL_REASONS} onChange={setCancelReason} />
            )}
          </ModalBody>
          <ModalFooter>
            <ChakraButton variant="ghost" mr={3} onClick={() => setCancelTarget(null)} isDisabled={cancelBusy}>Keep it</ChakraButton>
            <ChakraButton colorScheme="red" onClick={handleCancelAppointment} isLoading={cancelBusy} isDisabled={!cancelReason.trim()}>Confirm cancel</ChakraButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Accomplishment view: read-only summary of a signed-off consultation.
          The student can't edit this — only the faculty member who completed
          the consultation can write casePresented/interventionTaken/remarks,
          via FacultyDashboard's "Complete & Sign Off" form. */}
      <OnboardingModal
        isOpen={isProfileOpen}
        role="STUDENT"
        email={localStorage.getItem('userEmail') || ''}
        token={localStorage.getItem('token') || ''}
        onOpenPrivacy={onPrivacyOpen}
        onSkip={onProfileClose}
        onDone={(data) => {
          localStorage.setItem('userName', data.name);
          localStorage.setItem('token', data.token);
          localStorage.setItem('programPosition', data.programPosition || '');
          localStorage.setItem('onboardingComplete', 'true');
          window.location.reload(); // refresh so every part of the dashboard uses the completed profile
        }}
      />
      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={onPrivacyClose} />
      <Modal isOpen={isMasterOpen} onClose={onMasterClose} size="xl" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader color={textColor}>{masterFaculty?.name}: Master Schedule</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {masterLoading ? <Text color={mutedText}>Loading schedule...</Text> : (
              <VStack align="stretch" spacing={3}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                  const rows = [
                    ...masterData.classes.filter(c => c.dayOfWeek === i + 1).map(c => ({ kind: 'class', label: c.subject || 'Class', start: c.startTime, end: c.endTime })),
                    ...masterData.official.filter(c => c.dayOfWeek === i + 1).map(c => ({ kind: 'consult', label: 'Consultation Hours', start: c.startTime, end: c.endTime })),
                    ...masterData.added.filter(c => c.dayOfWeek === i + 1).map(c => ({ kind: 'consult', label: 'Added Consultation Hours', start: c.startTime, end: c.endTime })),
                  ].sort((a, b) => (a.start > b.start ? 1 : -1));
                  return (
                    <Box key={day}>
                      <Text fontWeight="600" fontSize="sm" color={textColor} mb={1}>{day}</Text>
                      {rows.length === 0 ? <Text fontSize="xs" color={mutedText} pl={2}>No scheduled hours</Text> : (
                        <VStack align="stretch" spacing={1} pl={2}>
                          {rows.map((r, idx) => (
                            <HStack key={idx} justify="space-between">
                              <Badge colorScheme={r.kind === 'class' ? 'gray' : 'green'} textTransform="none" whiteSpace="normal" px={2} py={0.5} borderRadius="md">{r.label}</Badge>
                              <Text fontSize="xs" color={mutedText} whiteSpace="nowrap">{formatTime(r.start)} – {formatTime(r.end)}</Text>
                            </HStack>
                          ))}
                        </VStack>
                      )}
                    </Box>
                  );
                })}
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
      <Modal isOpen={isSummaryOpen} onClose={onSummaryClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Consultation Accomplishment</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={8}>
            <VStack align="stretch" spacing={4}>
              <Box>
                <Text fontSize="xs" fontWeight="700" color={mutedText} textTransform="uppercase">Faculty</Text>
                <Text color={textColor}>{summaryApt?.facultyId?.name || 'Unknown'}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" fontWeight="700" color={mutedText} textTransform="uppercase">Date</Text>
                <Text color={textColor}>{formatDate(summaryApt?.date)} {summaryApt ? `at ${formatTime(summaryApt.time)}` : ''}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" fontWeight="700" color={mutedText} textTransform="uppercase">Case Presented</Text>
                <Text color={textColor}>{summaryApt?.casePresented || '—'}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" fontWeight="700" color={mutedText} textTransform="uppercase">Intervention / Action Taken</Text>
                <Text color={textColor}>{summaryApt?.interventionTaken || '—'}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" fontWeight="700" color={mutedText} textTransform="uppercase">Remarks</Text>
                <Text color={textColor}>{summaryApt?.remarks || '—'}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" fontWeight="700" color={mutedText} textTransform="uppercase">Signed Off</Text>
                <Text color={textColor}>{formatDateTime(summaryApt?.completedAt)}</Text>
              </Box>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>

  );
}
