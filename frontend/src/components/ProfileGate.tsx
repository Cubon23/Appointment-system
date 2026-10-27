import { useState } from 'react';
import { useDisclosure } from '@chakra-ui/react';
import OnboardingModal from './OnboardingModal';
import PrivacyPolicyModal from './PrivacyPolicyModal';

// Shown on a dashboard right after the first Google sign-in, until the person has filled in the details
// Google can't supply. Faculty, Dean and Admin must finish it; students may close it and browse read-only
// (the student dashboard has its own button to reopen it).
export default function ProfileGate({ role }: { role: string }) {
  const [open, setOpen] = useState(localStorage.getItem('onboardingComplete') === 'false');
  const { isOpen: privacyOpen, onOpen: onPrivacyOpen, onClose: onPrivacyClose } = useDisclosure();

  return (
    <>
      <OnboardingModal
        isOpen={open}
        role={role}
        email={localStorage.getItem('userEmail') || ''}
        name={localStorage.getItem('userName') || ''}
        token={localStorage.getItem('token') || ''}
        onOpenPrivacy={onPrivacyOpen}
        onSkip={role === 'STUDENT' ? () => setOpen(false) : undefined}
        onDone={(data) => {
          localStorage.setItem('userName', data.name);
          localStorage.setItem('token', data.token);
          localStorage.setItem('programPosition', data.programPosition || '');
          localStorage.setItem('onboardingComplete', 'true');
          window.location.reload(); // refresh so the whole dashboard uses the completed profile
        }}
      />
      <PrivacyPolicyModal isOpen={privacyOpen} onClose={onPrivacyClose} />
    </>
  );
}
