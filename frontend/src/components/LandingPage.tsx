import React, { useState } from 'react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { useNavigate } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, Input, Button, VStack, useToast, 
  FormControl, FormLabel, Select, useColorModeValue, Tabs, TabList, TabPanels, Tab, TabPanel,
  HStack, InputGroup, InputRightAddon,
  FormHelperText,
  InputRightElement,
  IconButton
} from '@chakra-ui/react';

export default function LandingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const bg = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Registration State
  const [regName, setRegName] = useState('');
  const [nameSuffix, setNameSuffix] = useState(''); // NEW: Tracks Jr., Sr., etc.
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);
  const [regRole, setRegRole] = useState<'STUDENT' | 'FACULTY'>('STUDENT');

  const [schoolId, setSchoolId] = useState('');

  // NEW: Cascading Dropdown State
  const [selProgram, setSelProgram] = useState('');
  const [selYear, setSelYear] = useState('');
  const [selSection, setSelSection] = useState('');

  const [facultyPosition, setFacultyPosition] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [facultyTitle, setFacultyTitle] = useState('Prof.');

  const [isRegistering, setIsRegistering] = useState(false); 
  const [showRules, setShowRules] = useState(false); // only show the checklist once they start typing

  // NEW: The "Database" Dictionary simulating academic attrition
  const cohortConfig: Record<string, Record<string, string[]>> = {

    'BS INFO': {
      '1': ['A', 'B', 'C', 'D', 'E'], // 1st year has 5 sections
      '2': ['A', 'B', 'C', 'D'],      // Reduced by 2nd year
      '3': ['A', 'B', 'C', 'D'],
      '4': ['A', 'B', 'C', 'D']            // Further attrition by 4th year
    },
    'BS COMSCI': {
      '1': ['A', 'B'], '2': ['A', 'B'], '3': ['A', 'B'], '4': ['A', 'B']
    },
    'BLIS': {
      '1': ['A', 'B'], '2': ['A', 'B'], '3': ['A', 'B'], '4': ['A', 'B']
    }
  };

  const PASSWORD_MIN_LENGTH = 12;
  const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

  const passwordRules = {
    length: regPassword.length >= PASSWORD_MIN_LENGTH,
    upper: /[A-Z]/.test(regPassword),
    number: /\d/.test(regPassword),
    symbol: /[^A-Za-z0-9]/.test(regPassword),
  };

  // --- THE TRUE LOGIN HANDLER ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    
    try {
      const fullLoginEmail = `${loginEmail.trim()}@ua.edu.ph`;

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/faculty/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fullLoginEmail, password: loginPassword })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      // Save secure data to local storage
      localStorage.setItem('userId', data._id);
      localStorage.setItem('userName', data.name);
      localStorage.setItem('userRole', data.role);

      toast({ title: 'Login Successful', status: 'success', duration: 2000 });

      // QR Attendance
      const intendedRoute = sessionStorage.getItem('intendedRoute');
      
      if (intendedRoute && data.role === 'STUDENT') {
        sessionStorage.removeItem('intendedRoute'); // Clear it so it doesn't fire again later
        navigate(intendedRoute);
        return;
      }

      // Default Navigation based on role
      if (data.role === 'STUDENT') navigate('/student-dashboard');
      else if (data.role === 'FACULTY') navigate('/faculty-dashboard');
      else if (data.role === 'ADMIN') navigate('/admin-dashboard');
      else if (data.role === 'DEAN') navigate('/dean-dashboard');

    } catch (error: any) {
      toast({ title: 'Authentication Failed', description: error.message, status: 'error', position: 'top' });
    }
    setIsLoggingIn(false);
  };


  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedName = e.target.value.replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
    setRegName(formattedName);
  };

  // --- THE REGISTRATION HANDLER ---
  const handleRegister = async (e: React.FormEvent) => {
  e.preventDefault();

  if (regRole === 'STUDENT') {
    const schoolIdPattern = /^(\d{4}-\d{4}-[A-Z]|\d{4}-S0\d{4})$/;
    if (!schoolIdPattern.test(schoolId)) {
      toast({ title: 'Invalid School ID', description: 'Format must be e.g. 2024-1234-A or 2025-S04321', status: 'warning' });
      return;
    }
  }

  if (regRole === 'FACULTY' && facultyId) {
  const facultyIdPattern = /^UA-[A-Z]{5}-\d{4}-\d{4}$/;
  if (!facultyIdPattern.test(facultyId)) {
    toast({ title: 'Invalid Faculty ID', description: 'Format must be e.g. UA-COSFM-2022-1234', status: 'warning' });
    return;
  }
}

  setIsRegistering(true);

    try {
      const baseName = nameSuffix ? `${regName.trim()} ${nameSuffix}` : regName.trim();
      const finalFullName = regRole === 'FACULTY' ? `${facultyTitle} ${baseName}` : baseName;

      // NEW: Stitch the cascading dropdowns back together securely
      const finalProgramPosition = regRole === 'STUDENT' 
        ? `${selProgram} ${selYear}${selSection}` 
        : facultyPosition;

      const fullRegEmail = `${regEmail.trim()}@ua.edu.ph`;

      if (!passwordPattern.test(regPassword)) {
        toast({ 
          title: 'Weak Password', 
          description: 'Must be at least 12 characters, with 1 uppercase letter, 1 number, and 1 symbol.', 
          status: 'warning' 
        });
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/faculty/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: finalFullName,
          email: fullRegEmail,
          password: regPassword,
          role: regRole,
          programPosition: finalProgramPosition,
          schoolId: regRole === 'STUDENT' ? schoolId : undefined,
          facultyId: regRole === 'FACULTY' ? facultyId : undefined
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast({
        title: regRole === 'STUDENT' ? 'Registration Complete' : 'Registration Pending',
        description: data.message,
        status: regRole === 'STUDENT' ? 'success' : 'info',
        duration: 7000,
        isClosable: true,
        position: 'top'
      });

      setRegName(''); 
      setRegEmail(''); 
      setRegPassword(''); 
      setSelProgram('');
      setSelYear('');
      setSelSection('');
      setFacultyPosition('');
    }catch (error) {
      toast({ 
        title: 'Registration Failed', 
        description: (error as Error).message, // <-- Typecasted safely here
        status: 'error', 
        position: 'top' 
      });
    }
    setIsRegistering(false);
  };

  return (
    <Flex minH="100vh" align="center" justify="center" bg={bg} p={4} direction={{ base: 'column', md: 'row' }}>
      
      <Box flex="1" p={10} maxW="600px" textAlign={{ base: 'center', md: 'left' }}>
        <Heading size="2xl" color="blue.600" mb={4}>CCIS Sync</Heading>
        <Heading size="lg" mb={6} color={useColorModeValue('gray.700', 'white')}>THE GWOK GWOKS</Heading>
        <Text fontSize="lg" color="gray.500" mb={8}>Streamline your academic schedule. Book consultations without the wait.</Text>
      </Box>

      <Box flex="1" w="100%" maxW="450px" bg={cardBg} borderRadius="xl" shadow="2xl" overflow="hidden" borderWidth="1px" borderColor={borderColor}>
        <Tabs isFitted colorScheme="blue" variant="enclosed-colored">
          <TabList mb="1em"><Tab py={4}>Login</Tab><Tab py={4}>Register</Tab></TabList>
          <TabPanels>
            
            {/* LOGIN PANEL */}
            <TabPanel p={8}>
              <form onSubmit={handleLogin}>
                <VStack spacing={5}>
                  <FormControl isRequired>
                    <FormLabel>University Email</FormLabel>
                    <InputGroup>
                      <Input 
                        placeholder="e.g. jdelacruz" 
                        value={loginEmail} 
                        onChange={(e) => setLoginEmail(e.target.value)} 
                      />
                      <InputRightAddon bg="gray.100" color="gray.600" fontWeight="bold">
                        @ua.edu.ph
                      </InputRightAddon>
                    </InputGroup>
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>Password</FormLabel>
                    <InputGroup>
                      <Input type={showLoginPw ? 'text' : 'password'} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                      <InputRightElement>
                        <IconButton
                          aria-label="Toggle password visibility"
                          icon={showLoginPw ? <ViewOffIcon /> : <ViewIcon />}
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowLoginPw(!showLoginPw)}
                        />
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>
                  <Button type="submit" colorScheme="blue" size="lg" w="100%" isLoading={isLoggingIn}>Secure Login</Button>
                </VStack>
              </form>
            </TabPanel>

            {/* REGISTRATION PANEL */}
  <TabPanel p={8}>
    <form onSubmit={handleRegister}>
      <VStack spacing={4}>
      
      {/* 1. ROLE SELECTOR */}
      <FormControl isRequired>
        <FormLabel>I am registering as a:</FormLabel>
        <Select value={regRole} onChange={(e) => setRegRole(e.target.value as 'STUDENT' | 'FACULTY')}>
          <option value="STUDENT">Student</option>
          <option value="FACULTY">Faculty Member</option>
        </Select>
      </FormControl>

      {/* 2. FULL NAME & SUFFIX */}
      <HStack align="flex-end" w="100%">
        {/* Render Title Dropdown ONLY for Faculty */}
        {regRole === 'FACULTY' && (
          <FormControl w="130px" isRequired>
            <FormLabel>Title</FormLabel>
            <Select value={facultyTitle} onChange={(e) => setFacultyTitle(e.target.value)}>
              <option value="Prof.">Prof.</option>
              <option value="Dr.">Dr.</option>
              <option value="Engr.">Engr.</option>
              <option value="Mr.">Mr.</option>
              <option value="Ms.">Ms.</option>
            </Select>
          </FormControl>
        )}

        <FormControl isRequired>
          <FormLabel>Full Name</FormLabel>
          <Input 
            placeholder="e.g. Juan Dela Cruz" 
            value={regName} 
            onChange={handleNameChange} 
          />
        </FormControl>

        <FormControl w="110px">
          <FormLabel>Suffix</FormLabel>
          <Select value={nameSuffix} onChange={(e) => setNameSuffix(e.target.value)}>
            <option value="">None</option>
            <option value="Sr.">Sr.</option>
            <option value="Jr.">Jr.</option>
            <option value="I">I</option>
            <option value="II">II</option>
            <option value="III">III</option>
            <option value="IV">IV</option>
            <option value="V">V</option>
          </Select>
        </FormControl>
      </HStack>

      {/* 3. DYNAMIC FORM FIELDS (ACADEMIC IDENTITY) */}
      {regRole === 'STUDENT' ? (
        <>
          <FormControl isRequired>
            <FormLabel>School ID</FormLabel>
            <Input 
              placeholder="2024-1234-A or 2025-S04321" 
              value={schoolId} 
              onChange={(e) => setSchoolId(e.target.value.toUpperCase())} 
            />
            <FormHelperText fontSize="xs">Old format: YYYY-XXXX-Letter · New format: YYYY-S0XXXX</FormHelperText>
          </FormControl>
        
          <FormControl isRequired>
            <FormLabel>Program / Year / Section</FormLabel>
            <HStack w="100%">
              {/* PROGRAM DROPDOWN */}
              <Select
                value={selProgram}
                onChange={(e) => {
                  setSelProgram(e.target.value);
                  setSelYear('');    // Reset downstream
                  setSelSection(''); // Reset downstream
                }}
                >
                <option value="" disabled hidden>Program</option>
                  {Object.keys(cohortConfig).map(prog => (
                <option value={prog} key={prog}>{prog}</option>
              ))}
            </Select>

              {/* YEAR DROPDOWN */}
            <Select
              value={selYear}
              onChange={(e) => {
                setSelYear(e.target.value);
                setSelSection(''); // Reset downstream section when year changes
              }}
              isDisabled={!selProgram}
            >
              <option value="" disabled hidden>Year</option>
              {selProgram && Object.keys(cohortConfig[selProgram]).map(year => (
                <option value={year} key={year}>{year}</option>
              ))}
            </Select>

            {/* SECTION DROPDOWN */}
            <Select
              value={selSection}
              onChange={(e) => setSelSection(e.target.value)}
              isDisabled={!selYear}
            >
              <option value="" disabled hidden>Section</option>
              {selProgram && selYear && cohortConfig[selProgram][selYear].map(sec => (
                <option value={sec} key={sec}>{sec}</option>
              ))}
            </Select>

          </HStack>
        </FormControl>
        </>
      ) : (
        <FormControl isRequired>
          <FormLabel>Academic Position</FormLabel>
          <Input 
            placeholder="e.g. IT Instructor or Program Head" 
            value={facultyPosition} 
            onChange={(e) => setFacultyPosition(e.target.value)} 
          />
        </FormControl>
      )}
      <FormControl>
        <FormLabel>Faculty ID <Text as="span" fontSize="xs" color="gray.400">(leave blank if not yet issued)</Text></FormLabel>
        <Input 
          placeholder="e.g. UA-COSFM-2022-1234" 
          value={facultyId} 
          onChange={(e) => setFacultyId(e.target.value.toUpperCase())} 
        />
      </FormControl>

      {/* 4. SYSTEM CREDENTIALS (MOVED TO BOTTOM) */}
      <FormControl isRequired>
        <FormLabel>University Email</FormLabel>
        <InputGroup>
          <Input 
            placeholder="e.g. jdelacruz" 
            value={regEmail} 
            onChange={(e) => setRegEmail(e.target.value)} 
          />
          <InputRightAddon bg="gray.100" color="gray.600" fontWeight="bold">
            @ua.edu.ph
          </InputRightAddon>
        </InputGroup>
      </FormControl>

      <FormControl isRequired>
  <FormLabel>Password</FormLabel>
  <InputGroup>
    <Input 
      type={showRegPw ? 'text' : 'password'} 
      value={regPassword} 
      onChange={(e) => { setRegPassword(e.target.value); setShowRules(true); }} 
    />
    <InputRightElement>
      <IconButton
        aria-label="Toggle password visibility"
        icon={showRegPw ? <ViewOffIcon /> : <ViewIcon />}
        size="sm"
        variant="ghost"
        onClick={() => setShowRegPw(!showRegPw)}
      />
    </InputRightElement>
  </InputGroup>
  {showRules && (
    <VStack align="start" mt={2} spacing={0} fontSize="xs">
      <Text color={passwordRules.length ? 'green.500' : 'gray.400'}>{passwordRules.length ? '✓' : '○'} At least 12 characters</Text>
      <Text color={passwordRules.upper ? 'green.500' : 'gray.400'}>{passwordRules.upper ? '✓' : '○'} One uppercase letter</Text>
      <Text color={passwordRules.number ? 'green.500' : 'gray.400'}>{passwordRules.number ? '✓' : '○'} One number</Text>
      <Text color={passwordRules.symbol ? 'green.500' : 'gray.400'}>{passwordRules.symbol ? '✓' : '○'} One symbol (e.g. ! @ # . _ -)</Text>
    </VStack>
  )}
</FormControl>

      {/* 5. SUBMIT BUTTON */}
      <Button type="submit" colorScheme="green" size="lg" w="100%" mt={4} isLoading={isRegistering}>
        {regRole === 'STUDENT' ? 'Create Account' : 'Request Faculty Access'}
      </Button>
      
    </VStack>
  </form>
</TabPanel>

          </TabPanels>
        </Tabs>
      </Box>
    </Flex>
  );
}