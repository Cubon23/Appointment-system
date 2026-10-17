import { useEffect, useState } from 'react';
import { Box, Flex, Text, Badge } from '@chakra-ui/react';
import { authFetch } from './authFetch';

interface ActiveBroadcast {
  _id: string;
  title: string;
  message: string;
  priority: 'URGENT' | 'NOTICE';
  createdByName: string;
  createdAt: string;
  expiresAt: string;
}

// Pinned Dean's announcement. Rendered as the first child of the dashboard's
// <main>; sticks to the top while the page content scrolls. Not dismissible:
// it disappears only when it expires or the Dean ends it.
export default function BroadcastBanner() {
  const [items, setItems] = useState<ActiveBroadcast[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      authFetch(`${import.meta.env.VITE_API_URL}/api/faculty/broadcasts/active`)
        .then(r => (r.ok ? r.json() : []))
        .then(d => { if (alive && Array.isArray(d)) setItems(d); })
        .catch(() => { /* keep showing the last known banner */ });
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!items.length) return null;

  return (
    <Box position="sticky" top="0" zIndex={20} flexShrink={0} maxH="40vh" overflowY="auto">
      {items.map(b => {
        const urgent = b.priority === 'URGENT';
        return (
          <Box
            key={b._id}
            role="alert"
            bg={urgent ? '#b91c1c' : '#1d4ed8'}
            color="#fff"
            px={5}
            py={3}
            borderBottom="1px solid rgba(255,255,255,0.25)"
          >
            <Flex align="center" gap={3} wrap="wrap">
              <Badge bg="#fff" color={urgent ? '#b91c1c' : '#1d4ed8'} fontSize="10px" px={2} borderRadius="4px">
                {urgent ? 'URGENT · DEAN' : 'NOTICE · DEAN'}
              </Badge>
              <Text fontWeight="700" fontSize="sm">{b.title}</Text>
            </Flex>
            <Text fontSize="sm" mt={1} whiteSpace="pre-wrap">{b.message}</Text>
            <Text fontSize="11px" mt={1} opacity={0.85}>
              {b.createdByName || 'Office of the Dean'} · posted {new Date(b.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
