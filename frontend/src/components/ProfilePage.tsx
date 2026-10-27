import { useEffect, useState } from 'react';
import { Box, Button, Heading, SimpleGrid, Spinner, Text, Badge, useColorModeValue, useDisclosure } from '@chakra-ui/react';
import { authFetch } from './authFetch';
import OnboardingModal from './OnboardingModal';
import PrivacyPolicyModal from './PrivacyPolicyModal';

interface Profile {
  name: string; email: string; role: string; gender: string; programPosition: string;
  schoolId: string; facultyId: string; privacyAcceptedAt: string | null; profileComplete: boolean;
}

// View of the logged-in person's own profile (students and faculty). Incomplete profiles get a
// "Complete profile" button that opens the same form used after first sign-in.
export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const { isOpen: privacyOpen, onOpen: onPrivacyOpen, onClose: onPrivacyClose } = useDisclosure();
  const cardBg = useColorModeValue('#ffffff', '#111d30');
  const border = useColorModeValue('#dde3ec', '#1e3048');
  const text = useColorModeValue('#0f2240', '#e8f0fe');
  const muted = useColorModeValue('#6b7fa0', '#7a93b0');

  useEffect(() => {
    authFetch(`${import.meta.env.VITE_API_URL}/api/auth/me`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then(setP)
      .catch((e: any) => setError(e.message || 'Could not load your profile.'));
  }, []);

  if (error) return <Text color="red.500">{error}</Text>;
  if (!p) return <Spinner />;

  const isStudent = p.role === 'STUDENT';
  const idLabel = isStudent ? 'School ID' : 'Employee ID';
  const idValue = isStudent ? p.schoolId : p.facultyId;
  const Row = ({ label, value }: { label: string; value?: string | null }) => (
    <Box>
      <Text fontSize="xs" color={muted}>{label}</Text>
      <Text fontWeight="600" color={text}>{value || '—'}</Text>
    </Box>
  );

  return (
    <Box bg={cardBg} p={6} borderRadius="lg" borderWidth="1px" borderColor={border} shadow="sm" maxW="720px">
      <Heading size="md" color={text} mb={1}>{p.name}</Heading>
      <Badge colorScheme={p.profileComplete ? 'green' : 'orange'} mb={5}>{p.profileComplete ? 'Profile complete' : 'Profile incomplete'}</Badge>

      {!p.profileComplete && (
        <Box mb={5} p={4} borderRadius="md" bg="orange.50" borderWidth="1px" borderColor="orange.300" color="orange.900">
          <Text fontSize="sm" mb={3}>
            {isStudent
              ? 'Complete your profile details and ID verification to unlock consultation requests.'
              : 'Complete your profile details to finish setting up your account.'}
          </Text>
          <Button size="sm" colorScheme="orange" onClick={() => setFormOpen(true)}>Complete profile</Button>
        </Box>
      )}

      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={4}>
        <Row label="School email" value={p.email} />
        <Row label="Role" value={isStudent ? 'Student' : 'Faculty'} />
        <Row label="Gender" value={p.gender} />
        <Row label={isStudent ? 'Program, year and section' : 'Academic position'} value={p.programPosition} />
        <Row label={idLabel} value={idValue} />
        <Row label="Privacy Policy accepted" value={p.privacyAcceptedAt ? new Date(p.privacyAcceptedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : ''} />
      </SimpleGrid>
      <Text fontSize="xs" color={muted} mt={5}>
        Your name and email come from your school Google account. To correct your ID or other details, ask the administrator.
      </Text>

      <OnboardingModal
        isOpen={formOpen}
        role={p.role}
        email={p.email}
        name={p.name}
        token={localStorage.getItem('token') || ''}
        onOpenPrivacy={onPrivacyOpen}
        onSkip={() => setFormOpen(false)}
        onDone={(data) => {
          localStorage.setItem('token', data.token);
          localStorage.setItem('programPosition', data.programPosition || '');
          localStorage.setItem('onboardingComplete', 'true');
          window.location.reload();
        }}
      />
      <PrivacyPolicyModal isOpen={privacyOpen} onClose={onPrivacyClose} />
    </Box>
  );
}
