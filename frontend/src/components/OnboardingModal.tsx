import { useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, VStack, FormControl, FormLabel,
  FormHelperText, Input, Select, Checkbox, Button, HStack, Text, Link as ChakraLink,
} from '@chakra-ui/react';
import { cohortConfig } from '../data/cohortConfig';

interface Props {
  isOpen: boolean;
  role: string;
  initialName: string;
  token: string;
  onDone: (data: any) => void;
  onOpenPrivacy: () => void;
}

// "Last name, First name, M.I." e.g. "Dela Cruz, Juan, A." (middle initial optional)
const parseName = (raw: string): string | null => {
  const parts = raw.split(',').map(p => p.trim().replace(/\s+/g, ' '));
  if (parts.length < 2 || parts.length > 3) return null;
  const [last, first, middle = ''] = parts;
  const pat = /^\p{L}[\p{L}\s.'’-]*$/u;
  if (!pat.test(last) || !pat.test(first)) return null;
  if (middle) {
    const m = middle.match(/^(\p{L})\.?$/u);
    if (!m) return null;
    return `${last}, ${first}, ${m[1].toUpperCase()}.`;
  }
  return `${last}, ${first}`;
};

export default function OnboardingModal({ isOpen, role, initialName, token, onDone, onOpenPrivacy }: Props) {
  const isStudent = role === 'STUDENT';
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [program, setProgram] = useState('');
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [position, setPosition] = useState('');
  const [idValue, setIdValue] = useState('');
  const [noId, setNoId] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    const cleanName = parseName(name);
    if (!cleanName) return setError('Enter your name as: Last name, First name, Middle initial (e.g. Dela Cruz, Juan, A.).');
    if (!gender) return setError('Please select your gender.');
    if (isStudent && !(program && year && section)) return setError('Please select your program, year and section.');
    if (!isStudent && !position.trim()) return setError('Please enter your position.');
    if (!privacy) return setError('Please accept the Privacy Policy.');

    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: cleanName,
          gender,
          programPosition: isStudent ? `${program} ${year}${section}` : position.trim(),
          schoolId: isStudent ? idValue : undefined,
          facultyId: role === 'FACULTY' ? idValue : undefined,
          noIdYet: noId,
          privacyAccepted: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save your details.');
      onDone(data);
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} closeOnOverlayClick={false} closeOnEsc={false} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Complete your profile</ModalHeader>
        <ModalBody pb={6}>
          <VStack spacing={4} align="stretch">
            <Text fontSize="sm" color="gray.600">
              Signed in as <b>{initialName}</b>. We just need a few details Google doesn't provide.
            </Text>
            <FormControl isRequired>
              <FormLabel>Full name</FormLabel>
              <Input placeholder="Dela Cruz, Juan, A." value={name} onChange={e => setName(e.target.value)} />
              <FormHelperText>Last name, First name, Middle initial (optional).</FormHelperText>
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Gender</FormLabel>
              <Select placeholder="Select" value={gender} onChange={e => setGender(e.target.value)}>
                <option>Male</option><option>Female</option>
              </Select>
            </FormControl>
            {isStudent ? (
              <HStack align="start">
                <FormControl isRequired>
                  <FormLabel>Program</FormLabel>
                  <Select placeholder="Select" value={program} onChange={e => { setProgram(e.target.value); setYear(''); setSection(''); }}>
                    {Object.keys(cohortConfig).map(p => <option key={p}>{p}</option>)}
                  </Select>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Year</FormLabel>
                  <Select placeholder="-" isDisabled={!program} value={year} onChange={e => { setYear(e.target.value); setSection(''); }}>
                    {program && Object.keys(cohortConfig[program]).map(y => <option key={y}>{y}</option>)}
                  </Select>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>Section</FormLabel>
                  <Select placeholder="-" isDisabled={!year} value={section} onChange={e => setSection(e.target.value)}>
                    {program && year && cohortConfig[program][year].map(s => <option key={s}>{s}</option>)}
                  </Select>
                </FormControl>
              </HStack>
            ) : (
              <FormControl isRequired>
                <FormLabel>Academic Position</FormLabel>
                <Input placeholder="e.g. IT Instructor or Program Head" value={position} onChange={e => setPosition(e.target.value)} />
              </FormControl>
            )}
            {(isStudent || role === 'FACULTY') && (
              <FormControl>
                {!noId && (
                  <>
                    <FormLabel>{isStudent ? 'School ID' : 'Faculty ID'}</FormLabel>
                    <Input
                      placeholder={isStudent ? 'e.g. 2024-1234-A or 2025-S04321' : 'e.g. UA-COSFM-2022-1234'}
                      value={idValue}
                      onChange={e => setIdValue(e.target.value.toUpperCase())}
                    />
                  </>
                )}
                <Checkbox mt={2} isChecked={noId} onChange={e => setNoId(e.target.checked)}>
                  I don't have my ID yet (an Admin can add it later)
                </Checkbox>
              </FormControl>
            )}
            <Checkbox isChecked={privacy} onChange={e => setPrivacy(e.target.checked)}>
              I have read and accept the{' '}
              <ChakraLink color="blue.500" onClick={(e) => { e.preventDefault(); onOpenPrivacy(); }}>Privacy Policy</ChakraLink>
            </Checkbox>
            {error && <Text color="red.500" fontSize="sm">{error}</Text>}
            <Button colorScheme="blue" onClick={submit} isLoading={saving}>Save and continue</Button>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
