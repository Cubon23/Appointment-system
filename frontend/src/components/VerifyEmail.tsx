import { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, Button, VStack, Spinner, Icon, useColorModeValue
} from '@chakra-ui/react';
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';

// Shown when someone clicks the "verify your email" link from their inbox.
// It reads the :token from the URL, sends it to the backend once, and
// displays whichever result comes back. It never asks the person to do
// anything else — verification is a one-click action.
export default function VerifyEmail() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const bg = useColorModeValue('#eaf5fb', '#0f1d33');
  const cardBg = useColorModeValue('white', 'gray.800');

  useEffect(() => {
    // Guard against running twice in React 18 StrictMode (dev only), which
    // would otherwise send the one-time token to the backend twice and
    // make the second call look like a failure.
    let cancelled = false;

    async function verify() {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/faculty/verify-email/${token}`);
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok) {
          setStatus('error');
          setMessage(data.error || 'This verification link is invalid or has expired.');
          return;
        }

        setStatus('success');
        setMessage(data.message || 'Your email has been verified.');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('Could not reach the server. Check your connection and try again.');
        }
      }
    }

    if (token) {
      verify();
    } else {
      setStatus('error');
      setMessage('No verification token was provided.');
    }

    return () => { cancelled = true; };
  }, [token]);

  return (
    <Flex minH="100vh" align="center" justify="center" bg={bg} p={4}>
      <Box bg={cardBg} borderRadius="2xl" boxShadow="xl" p={10} maxW="420px" w="100%" textAlign="center">
        <VStack spacing={5}>
          {status === 'loading' && (
            <>
              <Spinner size="xl" color="blue.400" thickness="3px" />
              <Heading size="md">Verifying your email...</Heading>
            </>
          )}

          {status === 'success' && (
            <>
              <Icon as={CheckCircleIcon} boxSize={14} color="green.400" />
              <Heading size="md">Email verified</Heading>
              <Text color="gray.500">{message}</Text>
              <Button as={RouterLink} to="/" colorScheme="blue" size="lg" w="100%">
                Go to Login
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <Icon as={WarningIcon} boxSize={14} color="red.400" />
              <Heading size="md">Verification failed</Heading>
              <Text color="gray.500">{message}</Text>
              <Button as={RouterLink} to="/" colorScheme="blue" size="lg" w="100%" variant="outline">
                Back to Login
              </Button>
            </>
          )}
        </VStack>
      </Box>
    </Flex>
  );
}
