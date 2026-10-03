import { useCallback, useEffect, useState } from 'react';
import {
  Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverBody, Portal,
  Box, Flex, Text, useColorModeValue,
} from '@chakra-ui/react';
import { EmailIcon } from '@chakra-ui/icons';
import moment from 'moment';
import { authFetch } from './authFetch';

const API = import.meta.env.VITE_API_URL;
const POLL_MS = 10000;

interface AppNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// 1-99 shown as-is, 100 or more shown as "99+"
export const formatBadge = (n: number) => (n > 99 ? '99+' : String(n));

interface Props {
  navText: string; // sidebar text color
  navBg: string;   // sidebar hover color
}

export default function NotificationBell({ navText, navBg }: Props) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const panelBg = useColorModeValue('#ffffff', '#0f1b2d');
  const panelBorder = useColorModeValue('#e2e8f0', '#1e3048');
  const textColor = useColorModeValue('#1a202c', '#e2e8f0');
  const mutedColor = useColorModeValue('#64748b', '#8fa6c4');
  const unreadBg = useColorModeValue('#eff6ff', '#13243d');

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/faculty/notifications`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch { /* network hiccup: try again on the next poll */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const markRead = async (n: AppNotification) => {
    if (n.read) return;
    setItems(prev => prev.map(i => (i._id === n._id ? { ...i, read: true } : i)));
    setUnread(u => Math.max(0, u - 1));
    try { await authFetch(`${API}/api/faculty/notifications/${n._id}/read`, { method: 'PATCH' }); }
    catch { load(); }
  };

  const markAllRead = async () => {
    setItems(prev => prev.map(i => ({ ...i, read: true })));
    setUnread(0);
    try { await authFetch(`${API}/api/faculty/notifications/read-all`, { method: 'PATCH' }); }
    catch { load(); }
  };

  return (
    <Popover placement="right-start" isLazy onOpen={load}>
      <PopoverTrigger>
        <button
          aria-label={unread > 0 ? `Mail, ${unread} unread` : 'Mail'}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
            padding: '9px 10px', marginBottom: '14px', borderRadius: '7px',
            background: 'transparent', color: navText, border: 'none',
            cursor: 'pointer', fontSize: '13px', textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = navBg)}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <EmailIcon boxSize="15px" />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: '-9px', right: '-13px',
                minWidth: '18px', height: '18px', padding: '0 5px', boxSizing: 'border-box',
                borderRadius: '9px', background: '#ef4444', color: '#fff',
                fontSize: '10px', fontWeight: 700, lineHeight: '18px', textAlign: 'center',
              }}>
                {formatBadge(unread)}
              </span>
            )}
          </span>
          <span style={{ marginLeft: '6px' }}>Mail</span>
        </button>
      </PopoverTrigger>

      <Portal>
        <PopoverContent w="340px" bg={panelBg} borderColor={panelBorder} color={textColor} _focus={{ outline: 'none' }}>
          <PopoverHeader borderColor={panelBorder}>
            <Flex justify="space-between" align="center">
              <Text fontWeight="700" fontSize="sm">Mail</Text>
              <button
                onClick={markAllRead}
                disabled={unread === 0}
                style={{
                  background: 'none', border: 'none', fontSize: '12px', fontWeight: 600,
                  color: unread === 0 ? mutedColor : '#2563eb',
                  cursor: unread === 0 ? 'default' : 'pointer',
                }}
              >
                Mark all as read
              </button>
            </Flex>
          </PopoverHeader>
          <PopoverBody p={0} maxH="380px" overflowY="auto">
            {items.length === 0 ? (
              <Text p={5} fontSize="sm" color={mutedColor} textAlign="center">No notifications yet.</Text>
            ) : (
              items.map(n => (
                <Box
                  key={n._id}
                  as="button"
                  onClick={() => markRead(n)}
                  w="100%" textAlign="left" px={4} py={3}
                  bg={n.read ? 'transparent' : unreadBg}
                  borderBottom="1px solid" borderColor={panelBorder}
                  _hover={{ opacity: 0.85 }}
                >
                  <Flex gap={2} align="flex-start">
                    <Box mt="6px" w="8px" h="8px" borderRadius="50%" flexShrink={0} bg={n.read ? 'transparent' : '#2563eb'} />
                    <Box minW={0}>
                      <Text fontSize="13px" fontWeight={n.read ? 500 : 700}>{n.title}</Text>
                      <Text fontSize="12px" color={mutedColor} mt="2px">{n.message}</Text>
                      <Text fontSize="11px" color={mutedColor} mt="4px">{moment(n.createdAt).fromNow()}</Text>
                    </Box>
                  </Flex>
                </Box>
              ))
            )}
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
