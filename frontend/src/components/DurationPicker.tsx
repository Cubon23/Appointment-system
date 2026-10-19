import { useEffect, useRef, useState } from 'react';
import {
  Box, Button, HStack, Input, InputGroup, InputRightElement, Popover, PopoverTrigger,
  PopoverContent, PopoverBody, PopoverFooter, Portal, Text, useDisclosure, useColorModeValue,
} from '@chakra-ui/react';

// Longest consultation a student can request (a faculty-side extension is planned separately)
export const MAX_DURATION_MINUTES = 60;

const PRESETS = [
  { label: '15min', minutes: 15 },
  { label: '30min', minutes: 30 },
  { label: '45min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
];

const ITEM_H = 32;
const HOURS = [0, 1];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

const describe = (total: number) => {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h === 1 ? '1 hour' : `${h} hours`} | ${m === 1 ? '1 minute' : `${m} minutes`}`;
};

interface Props {
  /** Duration in minutes, as a string ('' = nothing chosen yet) */
  value: string;
  onChange: (minutes: string) => void;
}

export default function DurationPicker({ value, onChange }: Props) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const total = Number(value) || 0;
  const [h, setH] = useState(Math.floor(total / 60));
  const [m, setM] = useState(total % 60);
  const minutesRef = useRef<HTMLDivElement | null>(null);

  const textColor = useColorModeValue('#0f2240', '#e8f0fe');
  const mutedText = useColorModeValue('#6b7fa0', '#7a93b0');
  const borderColor = useColorModeValue('#dde3ec', '#1e3048');
  const popBg = useColorModeValue('#ffffff', '#111d30');
  const selectedBg = useColorModeValue('#eef2f7', 'whiteAlpha.200');
  const presetBg = useColorModeValue('#f3f4f6', 'whiteAlpha.100');

  const draftTotal = h * 60 + m;
  const valid = draftTotal >= 1 && draftTotal <= MAX_DURATION_MINUTES;

  const open = () => {
    setH(Math.floor(total / 60));
    setM(total % 60);
    onOpen();
  };

  // Bring the selected minute into view when the picker opens
  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => {
      if (minutesRef.current) minutesRef.current.scrollTop = Math.max(0, m * ITEM_H - ITEM_H * 2);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pickHour = (hour: number) => {
    setH(hour);
    if (hour === 1) setM(0); // 1 hour is the maximum, so no extra minutes
  };

  const column = (title: string, items: number[], selected: number, isDisabled: (n: number) => boolean, onPick: (n: number) => void, ref?: React.Ref<HTMLDivElement>) => (
    <Box flex="1" textAlign="center">
      <Text fontSize="sm" fontWeight="bold" color={textColor} mb={1}>{title}</Text>
      <Box ref={ref} maxH={`${ITEM_H * 5}px`} overflowY="auto">
        {items.map(n => {
          const disabled = isDisabled(n);
          return (
            <Box
              key={n} h={`${ITEM_H}px`} lineHeight={`${ITEM_H}px`} fontSize="sm"
              bg={n === selected ? selectedBg : 'transparent'}
              fontWeight={n === selected ? 600 : 400}
              color={disabled ? mutedText : textColor}
              opacity={disabled ? 0.5 : 1}
              cursor={disabled ? 'not-allowed' : 'pointer'}
              onClick={() => { if (!disabled) onPick(n); }}
            >
              {n}
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  return (
    <Popover isOpen={isOpen} onOpen={open} onClose={onClose} placement="bottom-start" isLazy>
      <PopoverTrigger>
        <InputGroup>
          <Input
            readOnly cursor="pointer" color={total > 0 ? textColor : mutedText} borderColor={borderColor}
            value={total > 0 ? describe(total) : '__ hours | __ minutes'}
          />
          <InputRightElement cursor="pointer" color={mutedText}>
            {/* clock / history icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
              <path d="M12 7v5l3 2" />
            </svg>
          </InputRightElement>
        </InputGroup>
      </PopoverTrigger>
      <Portal>
        <PopoverContent bg={popBg} borderColor={borderColor} w="300px" maxW="95vw">
          <PopoverBody>
            <HStack spacing={2} mb={3} wrap="wrap">
              {PRESETS.map(p => (
                <Button
                  key={p.label} size="sm" bg={presetBg} color={textColor} fontWeight={400}
                  onClick={() => { setH(Math.floor(p.minutes / 60)); setM(p.minutes % 60); }}
                >
                  {p.label}
                </Button>
              ))}
            </HStack>
            <HStack align="flex-start" spacing={2}>
              {column('Hours', HOURS, h, () => false, pickHour)}
              {column('Minutes', MINUTES, m, (n) => h === 1 && n > 0, setM, minutesRef)}
            </HStack>
            <Text fontSize="xs" color={mutedText} mt={2} textAlign="center">Maximum duration: 1 hour</Text>
          </PopoverBody>
          <PopoverFooter borderColor={borderColor}>
            <HStack spacing={3}>
              <Button flex="1" size="sm" bg={presetBg} color={textColor} fontWeight={400} onClick={onClose}>Cancel</Button>
              <Button flex="1" size="sm" colorScheme="blue" isDisabled={!valid} onClick={() => { onChange(String(draftTotal)); onClose(); }}>Set</Button>
            </HStack>
          </PopoverFooter>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
