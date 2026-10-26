import { Box, Flex, HStack, Text, useColorModeValue } from '@chakra-ui/react';

interface Block { dayOfWeek: number; startTime: string; endTime: string; subject?: string }
interface Props { classes: Block[]; official: Block[]; added: Block[] }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_PX = 44;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
const label = (min: number) => `${((Math.floor(min / 60) + 11) % 12) + 1}${Math.floor(min / 60) >= 12 ? 'PM' : 'AM'}`;
const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h >= 12 ? 'PM' : 'AM'}`; };

// Read-only weekly calendar for a faculty member: classes (no classroom, ever), consultation hours and
// added consultation hours laid out on a Monday-Saturday time grid.
export default function WeeklyCalendar({ classes, official, added }: Props) {
  const border = useColorModeValue('#dde3ec', '#1e3048');
  const muted = useColorModeValue('#6b7fa0', '#7a93b0');
  const text = useColorModeValue('#0f2240', '#e8f0fe');

  const all = [...classes, ...official, ...added];
  const startHour = Math.min(7, ...all.map(b => Math.floor(toMin(b.startTime) / 60)));
  const endHour = Math.max(17, ...all.map(b => Math.ceil(toMin(b.endTime) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const total = hours.length * HOUR_PX;

  const kinds = [
    { items: classes, name: 'Class', bg: 'gray.200', darkBg: 'gray.600', fg: 'gray.800' },
    { items: official, name: 'Consultation Hours', bg: 'green.200', darkBg: 'green.700', fg: 'green.900' },
    { items: added, name: 'Added Consultation Hours', bg: 'purple.200', darkBg: 'purple.700', fg: 'purple.900' },
  ];
  const dark = useColorModeValue(false, true);

  return (
    <Box overflowX="auto">
      <Flex minW="620px" borderWidth="1px" borderColor={border} borderRadius="md" overflow="hidden">
        {/* time gutter */}
        <Box w="48px" flexShrink={0} borderRightWidth="1px" borderColor={border}>
          <Box h="28px" />
          {hours.map(h => (
            <Text key={h} h={`${HOUR_PX}px`} fontSize="10px" color={muted} textAlign="right" pr={1} pt="2px">{label(h * 60)}</Text>
          ))}
        </Box>
        {DAYS.map((day, i) => (
          <Box key={day} flex="1" minW="0" borderRightWidth={i < 5 ? '1px' : 0} borderColor={border}>
            <Text h="28px" lineHeight="28px" textAlign="center" fontSize="xs" fontWeight="700" color={text} borderBottomWidth="1px" borderColor={border}>{day}</Text>
            <Box position="relative" h={`${total}px`}>
              {hours.map((h, r) => (
                <Box key={h} position="absolute" left={0} right={0} top={`${r * HOUR_PX}px`} borderTopWidth={r ? '1px' : 0} borderColor={border} opacity={0.6} />
              ))}
              {kinds.flatMap(k => k.items.filter(b => b.dayOfWeek === i + 1).map((b, idx) => {
                const top = ((toMin(b.startTime) - startHour * 60) / 60) * HOUR_PX;
                const height = Math.max(14, ((toMin(b.endTime) - toMin(b.startTime)) / 60) * HOUR_PX - 2);
                return (
                  <Box
                    key={`${k.name}-${idx}-${b.startTime}`}
                    position="absolute" left="2px" right="2px" top={`${top}px`} h={`${height}px`}
                    bg={dark ? k.darkBg : k.bg} color={dark ? 'white' : k.fg}
                    borderRadius="sm" px={1} py="1px" overflow="hidden"
                    title={`${k.name}${b.subject ? `: ${b.subject}` : ''} ${clock(b.startTime)} – ${clock(b.endTime)}`}
                  >
                    <Text fontSize="10px" fontWeight="700" lineHeight="1.2" noOfLines={2}>{b.subject || k.name}</Text>
                    {height > 30 && <Text fontSize="9px" lineHeight="1.1">{clock(b.startTime)}–{clock(b.endTime)}</Text>}
                  </Box>
                );
              }))}
            </Box>
          </Box>
        ))}
      </Flex>
      <HStack mt={3} spacing={4} fontSize="xs" color={muted} wrap="wrap">
        <HStack><Box w="12px" h="12px" bg="gray.200" borderRadius="sm" /><Text>Class</Text></HStack>
        <HStack><Box w="12px" h="12px" bg="green.200" borderRadius="sm" /><Text>Consultation Hours</Text></HStack>
        <HStack><Box w="12px" h="12px" bg="purple.200" borderRadius="sm" /><Text>Added Consultation Hours</Text></HStack>
      </HStack>
    </Box>
  );
}
