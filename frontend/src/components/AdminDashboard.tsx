import React, { useState, useEffect } from 'react';
import { cohortConfig } from '../data/cohortConfig';
import { 
  Box, Heading, Text, Button as ChakraButton, VStack, Input, FormControl, FormLabel, 
  useToast, Select, HStack, Flex, Divider, Table, Thead, Tbody, Tr, Th, Td, Badge, useColorMode, useColorModeValue,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, useDisclosure 
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from './authFetch';
import NotificationBell from './NotificationBell';
// import { QRCodeSVG } from 'qrcode.react';

export const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const [hour, minute] = timeStr.split(':');
  const h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const standardHour = h % 12 || 12;
  return `${standardHour}:${minute} ${ampm}`;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const userName = localStorage.getItem('userName');
  const { colorMode, toggleColorMode } = useColorMode();
  const { isOpen, onOpen, onClose } = useDisclosure(); 

  const [activePage, setActivePage] = useState('home');
  const [facultyList, setFacultyList] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [facultySearch, setFacultySearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [role, setRole] = useState('FACULTY'); 
  const [allUsers, setAllUsers] = useState<any[]>([]);
  // const [selectedQr, setSelectedQr] = useState({ hash: '', name: '' }); 

  // Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [programPosition, setProgramPosition] = useState('');
  const [room, setRoom] = useState('');
  const [loading, setLoading] = useState(false);
  // const [generatedQr, setGeneratedQr] = useState('');
  const [newFacultyName, setNewFacultyName] = useState('');

  const [verifyingUser, setVerifyingUser] = useState<{ id: string, role: string, name: string } | null>(null);
  const [assignedIdValue, setAssignedIdValue] = useState('');

  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [subject, setSubject] = useState('');
  const [schedRoom, setSchedRoom] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1'); 
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

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

  const fetchAllData = () => {
    authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/status`).then(res => res.json()).then(data => setFacultyList(data));
    authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointments/all`).then(res => res.json()).then(data => setAppointments(data));
    authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/users/all`).then(res => res.json()).then(data => setAllUsers(data));
  };

  useEffect(() => { fetchAllData(); }, []);

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); 
    // setGeneratedQr('');
    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, programPosition, room, role })
      });
      const data = await response.json();
      if (response.ok) {
        toast({ title: data.message, status: 'success' });
        setNewFacultyName(data.facultyName);
        setName(''); setEmail(''); setProgramPosition(''); setRoom('');
        fetchAllData();
      } else { toast({ title: data.error, status: 'error' }); }
    } catch (error) { }
    setLoading(false);
  };

  const handleVerifyUser = (id: string, role: string, name: string) => {
  setVerifyingUser({ id, role, name });
  setAssignedIdValue('');
  onOpen();
};

  const submitVerification = async () => {
    if (!verifyingUser) return;
    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/users/${verifyingUser.id}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idValue: assignedIdValue })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast({ title: 'Verified', description: data.message, status: 'success' });
      onClose();
      // refresh the list so the verified user disappears from the pending queue
      fetchAllData();
    } catch (error: any) {
      toast({ title: 'Verification Failed', description: error.message, status: 'error' });
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/schedule/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facultyId: selectedFacultyId, subject, room: schedRoom, dayOfWeek: Number(dayOfWeek), startTime, endTime })
      });
      if (response.ok) {
        toast({ title: 'Schedule Added Successfully!', status: 'success' });
        setSubject(''); setSchedRoom(''); setStartTime(''); setEndTime('');
      }
    } catch (err) { toast({ title: 'Error adding schedule', status: 'error' }); }
  };

  const updateAppointmentStatus = async (targetApt: any, newStatus: string) => {
    if (newStatus === 'APPROVED') {
      const approvedThatDay = appointments.filter(a => a.status === 'APPROVED' && a.date === targetApt.date && a.facultyId?._id === targetApt.facultyId?._id);
      const timeToMinutes = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return (hours * 60) + minutes;
      };
      const targetMinutes = timeToMinutes(targetApt.time);

      for (let existingApt of approvedThatDay) {
        const existingMinutes = timeToMinutes(existingApt.time);
        const timeDifference = Math.abs(targetMinutes - existingMinutes);
        if (timeDifference === 0) {
          toast({ title: "Overlap Blocked", description: `This faculty already has an appointment at this exact time!`, status: "error", duration: 5000 });
          return; 
        }
        if (timeDifference <= 60) {
          const isConfirmed = window.confirm(`WARNING: This is only ${timeDifference} minutes away from another approved meeting for this faculty. Proceed?`);
          if (!isConfirmed) return; 
        }
      }
    }
    try {
      const response = await authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/appointment/${targetApt._id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        toast({ title: `Appointment ${newStatus}`, status: 'success' });
        fetchAllData();
      }
    } catch (error) {}
  };

  return (
    <Flex minH="100vh" bg={C.pageBg} fontFamily="'Segoe UI', system-ui, sans-serif" color={C.text}>
      
      {/* ── Custom Sidebar ── */}
      <aside style={{ width: "196px", flexShrink: 0, background: C.sidebar, display: "flex", flexDirection: "column", padding: "22px 14px" }}>
        <div style={{ padding: "4px 8px 28px" }}>
          <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.14em", color: "#fff", textTransform: "uppercase" }}>Admin Console</span>
          <div style={{ marginTop: "7px", width: "20px", height: "3px", background: "#2563eb", borderRadius: "2px" }} />
        </div>

        <NotificationBell navText={C.navText} navBg={C.navBg} />

        <nav style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {[
            { page: "home", label: "Provisioning" },
            { page: "faculty", label: "Faculty Management" },
            { page: "appointments", label: `Appointments (${appointments.filter(a => a.status === 'PENDING').length})` },
            { page: "verification", label: "Verification Queue" },
            { page: "students", label: "Student Management" }
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
      <Box flex="1" p={10} overflowY="auto">
        <Box mb={8}>
          <Heading size="lg" color={textColor} letterSpacing="tight">
            {activePage === 'home' && "System Provisioning"}
            {activePage === 'faculty' && "Faculty Roster & Live Status"}
            {activePage === 'appointments' && "Appointment Management"}
            {activePage === 'verification' && "Account Verification Queue"}
            {activePage === 'students' && "Student Management"}
          </Heading>
          <Text color={mutedText} mt={1}>Welcome back, {userName}</Text>
        </Box>
      

        {activePage === 'home' && (
          <Box display="flex" gap={8} flexDir={{ base: 'column', xl: 'row' }}>
            <Box flex="1" display="flex" flexDir="column" gap={6}>
              <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
                <Heading size="sm" mb={6} textTransform="uppercase" color={mutedText}>1. Provision Faculty Account</Heading>
                <form onSubmit={handleAddFaculty}>
                  <VStack spacing={4}>
                    <FormControl isRequired><FormLabel color={textColor}>Full Name</FormLabel><Input value={name} onChange={(e) => setName(e.target.value)} color={textColor} borderColor={borderColor}/></FormControl>
                    
                    <HStack w="100%">
                      <FormControl isRequired>
                        <FormLabel color={textColor}>Email</FormLabel>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} color={textColor} borderColor={borderColor}/>
                      </FormControl>
                      
                      <FormControl isRequired>
                        <FormLabel color={textColor}>Access Level (Role)</FormLabel>
                        <Select value={role} onChange={(e) => setRole(e.target.value)} color={textColor} borderColor={borderColor}>
                          <option value="FACULTY">Faculty Member</option>
                          <option value="DEAN">College Dean</option>
                          <option value="ADMIN">System Admin</option>
                        </Select>
                      </FormControl>
                    </HStack>

                    <HStack w="100%">
                      <FormControl isRequired>
                        <FormLabel color={textColor}>Program & Position</FormLabel>
                        <Input value={programPosition} onChange={(e) => setProgramPosition(e.target.value)} color={textColor} placeholder="e.g. Dean, CCIS" borderColor={borderColor}/>
                      </FormControl>
                      <FormControl isRequired>
                        <FormLabel color={textColor}>Room / Office</FormLabel>
                        <Input value={room} onChange={(e) => setRoom(e.target.value)} color={textColor} placeholder="e.g. Dean's Office" borderColor={borderColor}/>
                      </FormControl>
                    </HStack>
                    
                    <ChakraButton type="submit" colorScheme="blue" w="100%" isLoading={loading}>Generate Account</ChakraButton>
                  </VStack>
                </form>
              </Box>

              <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
                <Heading size="sm" mb={6} textTransform="uppercase" color={mutedText}>2. Assign Teaching Schedule</Heading>
                <form onSubmit={handleAddSchedule}>
                  <VStack spacing={4}>
                    <HStack w="100%">
                      <FormControl isRequired><FormLabel color={textColor}>Instructor</FormLabel><Select placeholder="Choose..." value={selectedFacultyId} onChange={(e) => setSelectedFacultyId(e.target.value)} color={textColor} borderColor={borderColor}>{facultyList.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}</Select></FormControl>
                      <FormControl isRequired><FormLabel color={textColor}>Subject</FormLabel><Input value={subject} onChange={e => setSubject(e.target.value)} color={textColor} borderColor={borderColor}/></FormControl>
                    </HStack>
                    <HStack w="100%">
                      <FormControl isRequired><FormLabel color={textColor}>Day</FormLabel><Select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)} color={textColor} borderColor={borderColor}><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></Select></FormControl>
                      <FormControl isRequired><FormLabel color={textColor}>Room</FormLabel><Input value={schedRoom} onChange={e => setSchedRoom(e.target.value)} color={textColor} borderColor={borderColor}/></FormControl>
                    </HStack>
                    <HStack w="100%">
                      <FormControl isRequired><FormLabel color={textColor}>Start</FormLabel><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} color={textColor} borderColor={borderColor}/></FormControl>
                      <FormControl isRequired><FormLabel color={textColor}>End</FormLabel><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} color={textColor} borderColor={borderColor}/></FormControl>
                    </HStack>
                    <ChakraButton type="submit" colorScheme="gray" variant="outline" w="100%">Assign Class Block</ChakraButton>
                  </VStack>
                </form>
              </Box>
            </Box>

            <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm" flex="1" minH="400px" display="flex" flexDir="column" alignItems="center" justifyContent="center">
              {newFacultyName ? (
                <VStack spacing={4}>
                  <Heading size="md" color="green.500">Provisioning Complete</Heading>
                  <Text textAlign="center" color={textColor}>Account created for <b>{newFacultyName}</b></Text>
                </VStack>
              ) : (
                <Text color={mutedText} textAlign="center">Fill provisioning form to create a faculty account.</Text>
              )}
            </Box>
          </Box>
        )}

        {activePage === 'faculty' && (
          <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
            <Input
              placeholder="Search by name or position..."
              value={facultySearch}
              onChange={(e) => setFacultySearch(e.target.value)}
              mb={4}
              maxW="400px"
              color={textColor}
              borderColor={borderColor}
            />
            <Table variant="simple" size="sm">
              <Thead><Tr><Th color={mutedText}>Name</Th><Th color={mutedText}>Position</Th><Th color={mutedText}>Live Status</Th></Tr></Thead>
              <Tbody>
                {facultyList
                  .filter(prof =>
                    prof.name.toLowerCase().includes(facultySearch.toLowerCase()) ||
                    prof.programPosition.toLowerCase().includes(facultySearch.toLowerCase())
                  )
                  .map(prof => (
                    <Tr key={prof._id}>
                      <Td fontWeight="bold" color={textColor}>{prof.name}</Td>
                      <Td color={textColor}>{prof.programPosition}</Td>
                      <Td><Badge colorScheme={prof.currentStatus === 'AVAILABLE' ? 'green' : 'gray'}>{prof.currentStatus}</Badge></Td>
                    </Tr>
                  ))}
                  
              </Tbody>
            </Table>
          </Box>
        )}
        
        {activePage === 'students' && (
          <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
            <HStack spacing={3} mb={4}>
              <Select
                placeholder="Program"
                value={filterProgram}
                onChange={(e) => { setFilterProgram(e.target.value); setFilterYear(''); setFilterSection(''); }}
                maxW="180px" color={textColor} borderColor={borderColor}
              >
                {Object.keys(cohortConfig).map(prog => <option key={prog} value={prog}>{prog}</option>)}
              </Select>

              <Select
                placeholder="Year"
                value={filterYear}
                onChange={(e) => { setFilterYear(e.target.value); setFilterSection(''); }}
                isDisabled={!filterProgram}
                maxW="120px" color={textColor} borderColor={borderColor}
              >
                {filterProgram && Object.keys(cohortConfig[filterProgram]).map(y => <option key={y} value={y}>{y}</option>)}
              </Select>

              <Select
                placeholder="Section"
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
                isDisabled={!filterYear}
                maxW="120px" color={textColor} borderColor={borderColor}
              >
                {filterProgram && filterYear && cohortConfig[filterProgram][filterYear].map(sec => <option key={sec} value={sec}>{sec}</option>)}
              </Select>

              <Input
                placeholder="Search by name..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                color={textColor} borderColor={borderColor}
              />
            </HStack>

            <Table variant="simple" size="sm">
              <Thead><Tr><Th color={mutedText}>Name</Th><Th color={mutedText}>School ID</Th><Th color={mutedText}>Program / Section</Th><Th color={mutedText}>Email</Th></Tr></Thead>
              <Tbody>
                {allUsers
                  .filter(u => u.role === 'STUDENT')
                  .filter(u => !filterProgram || u.programPosition?.startsWith(filterProgram))
                  .filter(u => !filterYear || u.programPosition?.includes(` ${filterYear}`))
                  .filter(u => !filterSection || u.programPosition?.endsWith(filterSection))
                  .filter(u => u.name.toLowerCase().includes(studentSearch.toLowerCase()))
                  .map(student => (
                    <Tr key={student._id}>
                      <Td fontWeight="bold" color={textColor}>{student.name}</Td>
                      <Td color={textColor}>{student.schoolId}</Td>
                      <Td color={textColor}>{student.programPosition}</Td>
                      <Td color={textColor}>{student.email}</Td>
                    </Tr>
                  ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {activePage === 'appointments' && (
          <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
            <Table variant="simple" size="sm">
              <Thead><Tr><Th color={mutedText}>Student</Th><Th color={mutedText}>Target Faculty</Th><Th color={mutedText}>Date/Time</Th><Th color={mutedText}>Reason</Th><Th color={mutedText}>Status</Th><Th color={mutedText}>Action</Th></Tr></Thead>
              <Tbody>
                {appointments.map(apt => (
                  <Tr key={apt._id}>
                    <Td fontWeight="bold" color={textColor}>{apt.studentName} ({apt.studentSection})</Td>
                    <Td color={textColor}>{apt.facultyId ? apt.facultyId.name : 'Unknown'}</Td>
                    <Td color={textColor}>{apt.date} {formatTime(apt.time)}</Td>
                    <Td maxW="200px" isTruncated color={textColor}>{apt.reason}</Td>
                    <Td><Badge colorScheme={apt.status === 'APPROVED' ? 'green' : apt.status === 'REJECTED' ? 'red' : 'yellow'}>{apt.status}</Badge></Td>
                    <Td>
                      {apt.status === 'PENDING' && (
                        <HStack spacing={2}>
                          <ChakraButton size="xs" colorScheme="green" onClick={() => updateAppointmentStatus(apt, 'APPROVED')}>Approve</ChakraButton>
                          <ChakraButton size="xs" colorScheme="red" onClick={() => updateAppointmentStatus(apt, 'REJECTED')}>Reject</ChakraButton>
                        </HStack>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {activePage === 'verification' && (
        <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={borderColor} shadow="sm">
          {/* <Text mb={4} color={mutedText}>
            <em>Note:</em> This queue shows students who registered without an official School ID (e.g. recent transferees), pending manual verification.
          </Text> */}
          <Divider mb={4} borderColor={borderColor}/>
          <Table variant="simple" size="sm">
            <Thead><Tr><Th color={mutedText}>Name</Th><Th color={mutedText}>Email</Th><Th color={mutedText}>Program</Th><Th color={mutedText}>Status</Th><Th color={mutedText}>Action</Th></Tr></Thead>
            <Tbody>
              {allUsers
                .filter(u => 
                  (u.role === 'STUDENT' && u.accountStatus === 'PENDING_APPROVAL') ||
                  (u.role === 'FACULTY' && u.accountStatus === 'PENDING_APPROVAL')
                )
                .map(user => (
                  <Tr key={user._id}>
                    <Td fontWeight="bold" color={textColor}>{user.name}</Td>
                    <Td color={textColor}>{user.email}</Td>
                    <Td color={textColor}>{user.programPosition}</Td>
                    <Td><Badge colorScheme="orange">Awaiting {user.role === 'STUDENT' ? 'School' : 'Faculty'} ID</Badge></Td>
                    <Td>
                      <ChakraButton size="xs" colorScheme="green" onClick={() => handleVerifyUser(user._id, user.role, user.name)}>
                        Assign ID & Verify
                      </ChakraButton>
                    </Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        </Box>
      )}

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Verify {verifyingUser?.name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody display="flex" flexDirection="column" pb={8}>
            <FormControl isRequired mb={4}>
              <FormLabel>{verifyingUser?.role === 'STUDENT' ? 'School ID' : 'Faculty ID'}</FormLabel>
              <Input 
                placeholder={verifyingUser?.role === 'STUDENT' ? '2023-1234-A' : 'UA-COSFM-2025-1234'}
                value={assignedIdValue}
                onChange={(e) => setAssignedIdValue(e.target.value.toUpperCase())}
              />
            </FormControl>
            <ChakraButton colorScheme="green" onClick={submitVerification}>Confirm Verification</ChakraButton>
          </ModalBody>
        </ModalContent>
        </Modal>
      </Box>
    </Flex>
  );
}