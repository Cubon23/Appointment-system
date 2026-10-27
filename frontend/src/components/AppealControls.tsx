import { useState } from 'react';
import {
  Badge, Button, HStack, Text, VStack, useToast, useColorModeValue,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
} from '@chakra-ui/react';
import { authFetch } from './authFetch';
import CancelReasonPicker, { STUDENT_APPEAL_REASONS, FACULTY_APPEAL_REASONS } from './CancelReasonPicker';

// Which statuses each side may appeal (must match the backend).
const APPEALABLE: Record<string, string[]> = {
  STUDENT: ['MISSED (STUDENT)', 'CANCELLED BY STUDENT'],
  FACULTY: ['MISSED (FACULTY)', 'CANCELLED BY FACULTY'],
};

const APPEAL_COLOR: Record<string, string> = { PENDING: 'yellow', ACCEPTED: 'green', REJECTED: 'red' };
const APPEAL_LABEL: Record<string, string> = { PENDING: 'Appeal pending', ACCEPTED: 'Appeal accepted (excused)', REJECTED: 'Appeal declined' };

interface Props {
  apt: any;
  role: 'STUDENT' | 'FACULTY' | 'DEAN';
  onChanged: () => void;
}

/**
 * Appeal button / status for one appointment row.
 *  - STUDENT and FACULTY can appeal their own missed or cancelled consultations (reason dropdown + "Other Reason").
 *  - FACULTY reviews student appeals on their consultations; DEAN reviews faculty appeals.
 */
export default function AppealControls({ apt, role, onChanged }: Props) {
  const toast = useToast();
  const mutedText = useColorModeValue('#6b7fa0', '#7a93b0');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const base = `${import.meta.env.VITE_API_URL}/api/faculty/appointment/${apt._id}/appeal`;
  const appeal = apt.appeal && apt.appeal.status ? apt.appeal : null;
  const canAppeal = !appeal && role !== 'DEAN' && APPEALABLE[role].includes(apt.status);
  const canReview = !!appeal && appeal.status === 'PENDING' &&
    ((role === 'FACULTY' && appeal.by === 'STUDENT') || (role === 'DEAN' && appeal.by === 'FACULTY'));

  const send = async (url: string, method: string, body: object, okTitle: string) => {
    setBusy(true);
    try {
      const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      toast({ title: okTitle, status: 'success', position: 'top' });
      setOpen(false);
      onChanged();
    } catch (e: any) {
      toast({ title: 'Could not complete that', description: e.message, status: 'error', position: 'top' });
    }
    setBusy(false);
  };

  if (!appeal && !canAppeal) return null;

  return (
    <VStack align="start" spacing={1} mt={1}>
      {appeal && (
        <>
          <Badge colorScheme={APPEAL_COLOR[appeal.status]} textTransform="none">
            {appeal.by === 'FACULTY' && role !== 'FACULTY' ? 'Faculty appeal' : appeal.by === 'STUDENT' && role !== 'STUDENT' ? 'Student appeal' : 'Your appeal'}: {APPEAL_LABEL[appeal.status]}
          </Badge>
          <Text fontSize="xs" color={mutedText}>Reason: {appeal.reason}</Text>
          {appeal.reviewNote && <Text fontSize="xs" color={mutedText}>Note: {appeal.reviewNote}</Text>}
        </>
      )}
      {canReview && (
        <HStack spacing={2}>
          <Button size="xs" colorScheme="green" isLoading={busy} onClick={() => send(base, 'PATCH', { decision: 'ACCEPTED' }, 'Appeal accepted')}>Accept</Button>
          <Button size="xs" colorScheme="red" variant="outline" isLoading={busy} onClick={() => send(base, 'PATCH', { decision: 'REJECTED' }, 'Appeal declined')}>Decline</Button>
        </HStack>
      )}
      {canAppeal && (
        <Button size="xs" variant="outline" colorScheme="blue" onClick={() => { setReason(''); setOpen(true); }}>Appeal</Button>
      )}

      <Modal isOpen={open} onClose={() => !busy && setOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Submit an appeal</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm" mb={3}>
              {role === 'STUDENT'
                ? 'Your appeal goes to the professor, who can excuse the missed or cancelled consultation.'
                : 'Your appeal goes to the Dean, who can excuse the missed or cancelled consultation.'}
            </Text>
            <CancelReasonPicker key={apt._id} options={role === 'STUDENT' ? STUDENT_APPEAL_REASONS : FACULTY_APPEAL_REASONS} onChange={setReason} />
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={() => setOpen(false)} isDisabled={busy}>Close</Button>
            <Button colorScheme="blue" isLoading={busy} isDisabled={!reason.trim()} onClick={() => send(base, 'POST', { reason }, 'Appeal submitted')}>Submit appeal</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}
