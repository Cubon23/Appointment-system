import { useRef } from 'react';
import {
  AlertDialog, AlertDialogOverlay, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, Button,
} from '@chakra-ui/react';

// Centered "Log out?" confirmation shared by every dashboard.
export default function LogoutConfirm({
  isOpen, onClose, onConfirm,
}: { isOpen: boolean; onClose: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered motionPreset="scale">
      <AlertDialogOverlay bg="blackAlpha.600">
        <AlertDialogContent borderRadius="xl" mx={4} maxW="380px" p={2}>
          <AlertDialogHeader fontSize="xl" fontWeight="700">Log out from CCIS Sync?</AlertDialogHeader>
          <AlertDialogFooter justifyContent="flex-start" gap={6}>
            <Button bg="#4361ee" color="#fff" _hover={{ bg: '#3651d4' }} borderRadius="lg" px={10} h="48px" onClick={onConfirm}>
              Yes, log out
            </Button>
            <Button ref={cancelRef} variant="ghost" color="#4361ee" _hover={{ bg: 'transparent', textDecoration: 'underline' }} onClick={onClose}>
              Cancel
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}
